import { Injectable, Logger } from '@nestjs/common';
import { Agent, fetch as undiciFetch } from 'undici';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { WapiMediaService } from '../wapi/media/wapi-media.service';
import {
  ALLOWED_MIMES_BY_TYPE,
  MEDIA_LIMITS_BY_TYPE,
  WapiMediaException,
  type WapiMediaType,
} from '../wapi/media/wapi-media.types';
import { interpolateAsync } from './interpolate';
import { resolveAndValidate } from './bot-http-ssrf';
import { BotHttpRateLimiterService } from './bot-http-rate-limiter.service';
import type { BotData } from './bot-flow-runtime';
import type { BotMediaFromUrlNode } from './bot.types';

/**
 * 4.P.3 — Ejecutor de nodos MEDIA_FROM_URL. Descarga un binario desde una URL
 * externa, lo sube a Meta vía `WapiMediaService.uploadToMeta` y devuelve el
 * mediaId resultante (junto con metadata: mime, size, sha256, localPath).
 *
 * Defensas reusadas del HTTP executor (4.N.3):
 *  - Rate limit per-org (token bucket compartido con HTTP node).
 *  - Interpolación de url/headers/filename/caption (soporta {{var}} + {{= expr }}).
 *  - SSRF guard (DNS lookup propio + IP blocklist) + undici Agent custom lookup
 *    para anti DNS-rebinding.
 *  - AbortController timeout (clamp [1000, 30000] ms — más alto que HTTP por
 *    el upload posterior a Meta).
 *  - Lectura streaming con cap por tipo de Meta (image 5MB, document 100MB, etc).
 *  - No follow redirects, sólo http/https (http bloqueado en prod).
 *
 * Detección de MIME:
 *  1. Header `Content-Type` del response (si viene).
 *  2. Sniff por magic bytes (PDF, JPEG, PNG, GIF, MP4) — útil para servidores
 *     que no mandan Content-Type (caso real: infraccionesba.gba.gob.ar).
 *  3. Si el sniff no resolvió, usa el MIME por defecto del `mediaType` declarado
 *     (image → image/jpeg, document → application/pdf, etc.).
 *
 * El executor NUNCA tira excepción al caller — todos los errores se devuelven
 * como `{ ok: false, error: '<código>' }` para que el engine ramifique por
 * `errorNodeId` sin try/catch.
 *
 * Sandbox (modo mock): si `mode === 'mock'`, no toca la red — devuelve un result
 * fake con `mediaId = node.mockMediaId` si está, o un error `mock-undefined`.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

const DEFAULT_MIME_BY_TYPE: Record<WapiMediaType, string> = {
  image: 'image/jpeg',
  audio: 'audio/mpeg',
  video: 'video/mp4',
  document: 'application/pdf',
  sticker: 'image/webp',
};

const DEFAULT_FILENAME_BY_TYPE: Record<WapiMediaType, string> = {
  image: 'image.jpg',
  audio: 'audio.mp3',
  video: 'video.mp4',
  document: 'document.pdf',
  sticker: 'sticker.webp',
};

export interface MediaFetchExecResult {
  ok: boolean;
  durationMs: number;
  /** Códigos de error estables — usar para ramificación y métricas. */
  error?:
    | 'feature-disabled'
    | 'rate-limited'
    | 'interpolation-failed'
    | 'invalid-url'
    | 'invalid-scheme'
    | 'http-not-allowed-in-prod'
    | 'ssrf-blocked'
    | 'timeout'
    | 'network-error'
    | 'response-too-large'
    | 'response-empty'
    | 'redirect-not-followed'
    | 'http-error'
    | 'mime-not-allowed'
    | 'upload-failed'
    | 'mock-undefined';
  /** HTTP status del download (si llegó a haber response). */
  status?: number;
  /** mediaId devuelto por Meta (o `mockMediaId` en sandbox). */
  mediaId?: string;
  mime?: string;
  size?: number;
  sha256?: string;
  /** Path local relativo donde se persistió el binario (para el mediaLocalPath del WapiMessage). */
  localPath?: string;
  /** Filename usado al subir a Meta. */
  filename?: string;
}

interface ExecuteOptions {
  mode: 'mock' | 'real';
  configId: string;
  nodeId: string;
  organizationId: string;
}

@Injectable()
export class BotMediaFetchService {
  private readonly logger = new Logger(BotMediaFetchService.name);

  constructor(
    private readonly rateLimiter: BotHttpRateLimiterService,
    private readonly media: WapiMediaService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(
    node: BotMediaFromUrlNode,
    data: BotData,
    options: ExecuteOptions,
  ): Promise<MediaFetchExecResult> {
    if (options.mode === 'mock') {
      return this.executeMock(node);
    }

    if (process.env.WAPI_BOT_HTTP_ENABLED === 'false') {
      return { ok: false, error: 'feature-disabled', durationMs: 0 };
    }

    if (!(await this.rateLimiter.tryAcquire(options.organizationId))) {
      return { ok: false, error: 'rate-limited', durationMs: 0 };
    }

    const startedAt = Date.now();

    let urlInterp: string;
    let headersInterp: Record<string, string>;
    let captionInterp: string | undefined;
    let filenameInterp: string | undefined;
    try {
      urlInterp = await interpolateAsync(node.url, data);
      headersInterp = await interpolateHeaders(node.headers, data);
      captionInterp = node.caption ? await interpolateAsync(node.caption, data) : undefined;
      filenameInterp = node.filename ? await interpolateAsync(node.filename, data) : undefined;
    } catch (err) {
      this.logger.warn(`MEDIA_FROM_URL interpolación falló: ${(err as Error).message}`);
      return { ok: false, error: 'interpolation-failed', durationMs: Date.now() - startedAt };
    }

    let parsed: URL;
    try {
      parsed = new URL(urlInterp);
    } catch {
      return { ok: false, error: 'invalid-url', durationMs: Date.now() - startedAt };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'invalid-scheme', durationMs: Date.now() - startedAt };
    }
    if (parsed.protocol === 'http:' && process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'http-not-allowed-in-prod', durationMs: Date.now() - startedAt };
    }

    const allowPrivate = process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS === 'true';
    let resolved;
    try {
      resolved = await resolveAndValidate(parsed.hostname, allowPrivate);
    } catch {
      return { ok: false, error: 'ssrf-blocked', durationMs: Date.now() - startedAt };
    }

    const timeoutMs = clamp(node.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxBytes = MEDIA_LIMITS_BY_TYPE[node.mediaType];

    const agent = new Agent({
      connect: {
        lookup: (_hostname: string, opts: { all?: boolean } | undefined, cb: unknown) => {
          const callback = cb as (
            err: NodeJS.ErrnoException | null,
            addrOrList: string | { address: string; family: number }[],
            family?: number,
          ) => void;
          if (opts && opts.all) {
            callback(null, [{ address: resolved.ip, family: resolved.family }]);
          } else {
            callback(null, resolved.ip, resolved.family);
          }
        },
      },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    let status = 0;
    try {
      const res = await undiciFetch(urlInterp, {
        method: 'GET',
        headers: headersInterp,
        signal: ctrl.signal,
        redirect: 'manual',
        dispatcher: agent,
      });
      status = res.status;

      if (res.status >= 300 && res.status < 400) {
        this.logger.warn(
          `MEDIA_FROM_URL redirect status=${res.status} url=${urlInterp} config=${options.configId} node=${options.nodeId}`,
        );
        return {
          ok: false,
          status: res.status,
          error: 'redirect-not-followed',
          durationMs: Date.now() - startedAt,
        };
      }
      if (res.status < 200 || res.status >= 300) {
        this.logger.warn(
          `MEDIA_FROM_URL http-error status=${res.status} url=${urlInterp} config=${options.configId} node=${options.nodeId}`,
        );
        return {
          ok: false,
          status: res.status,
          error: 'http-error',
          durationMs: Date.now() - startedAt,
        };
      }

      let buffer: Buffer;
      try {
        buffer = await readBodyAsBuffer(res, maxBytes);
      } catch (err) {
        if (err instanceof Error && err.message === 'response-too-large') {
          return {
            ok: false,
            status: res.status,
            error: 'response-too-large',
            durationMs: Date.now() - startedAt,
          };
        }
        throw err;
      }

      if (buffer.length === 0) {
        return {
          ok: false,
          status: res.status,
          error: 'response-empty',
          durationMs: Date.now() - startedAt,
        };
      }

      const headerCt = (res.headers.get('content-type') ?? '').toLowerCase().split(';')[0]?.trim();
      const sniffed = sniffMimeFromBuffer(buffer);
      const mime = pickMime(headerCt, sniffed, node.mediaType);
      const allowed = ALLOWED_MIMES_BY_TYPE[node.mediaType];
      if (!allowed.has(mime)) {
        this.logger.warn(
          `MEDIA_FROM_URL mime ${mime} no permitido para type=${node.mediaType} ` +
            `(header=${headerCt ?? 'none'} sniff=${sniffed ?? 'none'})`,
        );
        return {
          ok: false,
          status: res.status,
          error: 'mime-not-allowed',
          durationMs: Date.now() - startedAt,
        };
      }

      const finalFilename =
        filenameInterp && filenameInterp.trim()
          ? filenameInterp
          : DEFAULT_FILENAME_BY_TYPE[node.mediaType];

      let uploadResult;
      try {
        uploadResult = await this.media.uploadToMeta({
          configId: options.configId,
          type: node.mediaType,
          buffer,
          mime,
          filename: finalFilename,
          ...(captionInterp ? { caption: captionInterp } : {}),
        });
      } catch (err) {
        const msg = err instanceof WapiMediaException ? err.code : (err as Error).message;
        this.logger.warn(
          `MEDIA_FROM_URL upload a Meta falló config=${options.configId} node=${options.nodeId}: ${msg}`,
        );
        return {
          ok: false,
          status: res.status,
          error: 'upload-failed',
          durationMs: Date.now() - startedAt,
        };
      }

      const durationMs = Date.now() - startedAt;
      const result: MediaFetchExecResult = {
        ok: true,
        durationMs,
        status: res.status,
        mediaId: uploadResult.mediaId,
        mime,
        size: uploadResult.size,
        sha256: uploadResult.sha256,
        localPath: uploadResult.localPath,
        filename: finalFilename,
      };

      void this.audit.log({
        action: 'wapi.bot.media-from-url.executed',
        resourceType: 'WapiBotMediaFromUrlNode',
        resourceId: `${options.configId}:${options.nodeId}`,
        metadata: {
          configId: options.configId,
          nodeId: options.nodeId,
          urlHost: parsed.host,
          mediaType: node.mediaType,
          mime,
          size: uploadResult.size,
          status: res.status,
          durationMs,
        },
        organizationId: options.organizationId,
      });

      return result;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (!isAbort) {
        const cause = (err as { cause?: { code?: string; message?: string } }).cause;
        this.logger.warn(
          `MEDIA_FROM_URL fetch error config=${options.configId} node=${options.nodeId}: ` +
            `${(err as Error).message}` +
            (cause ? ` | cause.code=${cause.code ?? '?'} cause.msg=${cause.message ?? '?'}` : ''),
        );
      }
      return {
        ok: false,
        status,
        error: isAbort ? 'timeout' : 'network-error',
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timer);
      void agent.close().catch(() => {
        /* ignore */
      });
    }
  }

  private executeMock(node: BotMediaFromUrlNode): MediaFetchExecResult {
    if (!node.mockMediaId || !node.mockMediaId.trim()) {
      return { ok: false, error: 'mock-undefined', durationMs: 0 };
    }
    return {
      ok: true,
      durationMs: 0,
      mediaId: node.mockMediaId,
      mime: DEFAULT_MIME_BY_TYPE[node.mediaType],
      size: 0,
      filename: node.filename ?? DEFAULT_FILENAME_BY_TYPE[node.mediaType],
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function interpolateHeaders(
  headers: Record<string, string> | undefined,
  data: BotData,
): Promise<Record<string, string>> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = typeof v === 'string' ? await interpolateAsync(v, data) : String(v);
  }
  return out;
}

async function readBodyAsBuffer(
  res: Awaited<ReturnType<typeof undiciFetch>>,
  max: number,
): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        throw new Error('response-too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

/**
 * Detecta MIME por magic bytes. Cubre los tipos que Meta acepta como media
 * (PDF, JPEG, PNG, GIF, MP4, WEBP). Devuelve null si no reconoce — el caller
 * cae al fallback por mediaType declarado.
 */
function sniffMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  const b0 = buf[0]!,
    b1 = buf[1]!,
    b2 = buf[2]!,
    b3 = buf[3]!;
  // PDF: %PDF
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return 'application/pdf';
  // JPEG: FF D8 FF
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'image/png';
  // GIF: 47 49 46 38 (GIF8)
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) return 'image/gif';
  // WEBP: RIFF .... WEBP (bytes 0-3 = RIFF, 8-11 = WEBP)
  if (
    buf.length >= 12 &&
    b0 === 0x52 &&
    b1 === 0x49 &&
    b2 === 0x46 &&
    b3 === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  // MP4: 00 00 00 ?? 66 74 79 70 (ftyp box)
  if (
    buf.length >= 8 &&
    b0 === 0x00 &&
    b1 === 0x00 &&
    b2 === 0x00 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    return 'video/mp4';
  }
  return null;
}

/**
 * Resuelve el MIME final priorizando: (1) header Content-Type, (2) sniff por
 * magic bytes, (3) default por mediaType declarado.
 */
function pickMime(
  headerCt: string | undefined,
  sniffed: string | null,
  mediaType: WapiMediaType,
): string {
  if (headerCt && headerCt.length > 0 && headerCt !== 'application/octet-stream') {
    return headerCt;
  }
  if (sniffed) return sniffed;
  return DEFAULT_MIME_BY_TYPE[mediaType];
}
