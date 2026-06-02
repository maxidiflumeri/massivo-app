import { Injectable, Logger } from '@nestjs/common';
import { Agent, fetch as undiciFetch } from 'undici';
import { resolveAndValidate } from '../../wapi/bot/wapi-bot-http-ssrf';
import type { EmailAttachment } from '../sender/email-sender';

const PER_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TOTAL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (SES raw send cap)
const FETCH_TIMEOUT_MS = 15_000;

export interface AttachmentSource {
  url: string;
  filename?: string;
}

export class AttachmentFetchError extends Error {
  constructor(public code: string, public details?: string) {
    super(`attachment-fetch-failed:${code}${details ? `:${details}` : ''}`);
    this.name = 'AttachmentFetchError';
  }
}

/**
 * Descarga adjuntos desde URLs públicas con SSRF guard + size cap + timeout.
 * Pensado para el endpoint POST /api/email/transactional, donde el caller
 * pasa URLs (ej. cupón de pago de SACIT) y nosotros los bajamos para
 * adjuntarlos al mail.
 *
 * Reusa el SSRF guard de bot-http (mismo riesgo: tenant podría apuntar a
 * IPs internas para exfiltrar metadata IMDS o internal services). Cuando
 * el entorno habilita `WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS=true` (típico en
 * dev local), también lo respetamos para que el dev pueda probar contra
 * un nginx local.
 */
@Injectable()
export class AttachmentsFetcherService {
  private readonly logger = new Logger(AttachmentsFetcherService.name);

  async fetchAll(sources: AttachmentSource[]): Promise<EmailAttachment[]> {
    if (!sources || sources.length === 0) return [];

    const out: EmailAttachment[] = [];
    let totalBytes = 0;

    for (const src of sources) {
      const a = await this.fetchOne(src);
      totalBytes += a.content.byteLength;
      if (totalBytes > TOTAL_MAX_BYTES) {
        throw new AttachmentFetchError(
          'total-size-exceeded',
          `${totalBytes} > ${TOTAL_MAX_BYTES}`,
        );
      }
      out.push(a);
    }

    return out;
  }

  private async fetchOne(src: AttachmentSource): Promise<EmailAttachment> {
    let parsed: URL;
    try {
      parsed = new URL(src.url);
    } catch {
      throw new AttachmentFetchError('invalid-url');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new AttachmentFetchError('invalid-scheme', parsed.protocol);
    }

    const allowPrivate = process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS === 'true';
    let resolved;
    try {
      resolved = await resolveAndValidate(parsed.hostname, allowPrivate);
    } catch {
      throw new AttachmentFetchError('ssrf-blocked', parsed.hostname);
    }

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
      headersTimeout: FETCH_TIMEOUT_MS,
      bodyTimeout: FETCH_TIMEOUT_MS,
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await undiciFetch(src.url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'manual',
        dispatcher: agent,
      });

      if (res.status >= 300 && res.status < 400) {
        throw new AttachmentFetchError('redirect-not-followed', String(res.status));
      }
      if (res.status < 200 || res.status >= 300) {
        throw new AttachmentFetchError('http-error', String(res.status));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new AttachmentFetchError('no-body');
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > PER_ATTACHMENT_MAX_BYTES) {
            await reader.cancel().catch(() => undefined);
            throw new AttachmentFetchError(
              'attachment-too-large',
              `${total} > ${PER_ATTACHMENT_MAX_BYTES}`,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock?.();
      }
      if (total === 0) throw new AttachmentFetchError('response-empty');

      const buffer = Buffer.concat(chunks);
      const contentType = (res.headers.get('content-type') ?? '')
        .toLowerCase()
        .split(';')[0]
        ?.trim();

      const filename =
        src.filename?.trim() ||
        filenameFromDisposition(res.headers.get('content-disposition')) ||
        filenameFromUrl(parsed) ||
        'attachment';

      this.logger.debug(
        `attachment fetched ${parsed.host}${parsed.pathname} → ${total}b ${contentType || '(no ct)'} as ${filename}`,
      );

      return {
        filename,
        content: buffer,
        ...(contentType ? { contentType } : {}),
      };
    } catch (err) {
      if (err instanceof AttachmentFetchError) throw err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new AttachmentFetchError(
        isAbort ? 'timeout' : 'network-error',
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
      void agent.close().catch(() => {
        /* ignore */
      });
    }
  }
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1]?.trim() ?? null;
}

function filenameFromUrl(parsed: URL): string | null {
  const last = parsed.pathname.split('/').filter(Boolean).pop();
  if (!last) return null;
  // Si la URL termina en path tipo /generar-cupon, el "filename" no tiene
  // extensión. Devolvemos null para que caiga al default ("attachment").
  return last.includes('.') ? decodeURIComponent(last) : null;
}
