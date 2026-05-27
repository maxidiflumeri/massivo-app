import { Injectable, Logger } from '@nestjs/common';
import { Agent, fetch as undiciFetch } from 'undici';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { interpolateAsync } from './interpolate';
import { resolveAndValidate } from './wapi-bot-http-ssrf';
import { WapiBotHttpRateLimiterService } from './wapi-bot-http-rate-limiter.service';
import type { HttpExecResult } from './bot-flow-runtime';
import type { BotHttpNode } from './wapi-bot.types';
import type { BotData } from './bot-flow-runtime';

/**
 * 4.N.3 — Ejecutor de nodos HTTP del bot. Dos modos:
 *  - `mock`: devuelve `node.mockResponse` o `{ ok:false, error:'mock-undefined' }`.
 *    Usado por el sandbox del bot designer cuando el operador elige modo Mock.
 *  - `real`: hace la request real con SSRF guard + DNS rebinding protection +
 *    timeout + max response size + rate limit por org.
 *
 * En modo real:
 *  1. Rate limit per-org (token bucket).
 *  2. Interpolación de url/headers/body con `interpolateAsync` (soporta `{{var}}` y `{{= expr }}`).
 *  3. Validación URL (scheme, parseable).
 *  4. DNS lookup propio + IP blocklist (`resolveAndValidate`).
 *  5. fetch con undici Agent que usa la IP ya resuelta (sin re-DNS) → previene rebinding.
 *  6. AbortController timeout (clamp 100..10000 ms).
 *  7. Lectura streaming con cap 1 MB.
 *  8. No-follow redirects (`redirect: 'manual'`).
 *  9. Audit log (sólo si la request se ejecutó — no si fue bloqueada por rate/SSRF/etc).
 *
 * El executor NUNCA tira excepción al caller — todos los errores se devuelven como
 * `{ ok: false, status: 0, error: '<código>' }` para que el engine ramifique por
 * `errorNodeId` sin try/catch.
 */

const MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 10_000;

interface ExecuteOptions {
  mode: 'mock' | 'real';
  configId: string;
  nodeId: string;
  organizationId: string;
}

@Injectable()
export class WapiBotHttpExecutor {
  private readonly logger = new Logger(WapiBotHttpExecutor.name);

  constructor(
    private readonly rateLimiter: WapiBotHttpRateLimiterService,
    private readonly audit: AuditLogService,
  ) {}

  async execute(
    node: BotHttpNode,
    data: BotData,
    options: ExecuteOptions,
  ): Promise<HttpExecResult> {
    if (options.mode === 'mock') {
      return this.executeMock(node);
    }

    if (process.env.WAPI_BOT_HTTP_ENABLED === 'false') {
      return errorResult('feature-disabled', 0);
    }

    if (!this.rateLimiter.tryAcquire(options.organizationId)) {
      return errorResult('rate-limited', 0);
    }

    const startedAt = Date.now();
    let urlInterp: string;
    let headersInterp: Record<string, string>;
    let bodyInterp: unknown;
    try {
      urlInterp = await interpolateAsync(node.url, data);
      headersInterp = await interpolateHeaders(node.headers, data);
      bodyInterp = node.body !== undefined ? await interpolateBodyLeaves(node.body, data) : undefined;
    } catch (err) {
      this.logger.warn(`HTTP interpolation falló: ${(err as Error).message}`);
      return errorResult('interpolation-failed', 0, startedAt);
    }

    let parsed: URL;
    try {
      parsed = new URL(urlInterp);
    } catch {
      return errorResult('invalid-url', 0, startedAt);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return errorResult('invalid-scheme', 0, startedAt);
    }
    if (parsed.protocol === 'http:' && process.env.NODE_ENV === 'production') {
      return errorResult('http-not-allowed-in-prod', 0, startedAt);
    }

    const allowPrivate = process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS === 'true';
    let resolved;
    try {
      resolved = await resolveAndValidate(parsed.hostname, allowPrivate);
    } catch {
      return errorResult('ssrf-blocked', 0, startedAt);
    }

    const timeoutMs = clamp(node.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);

    // Agent que fuerza el uso de la IP resuelta (anti-rebinding).
    // Undici llama lookup con `{ all: true }` y espera un array de `{address, family}`;
    // si `all` no está, soporta la firma legacy `(err, address, family)`. Cubrimos ambas.
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

    try {
      const hasBody =
        bodyInterp !== undefined && ['POST', 'PUT', 'PATCH'].includes(node.method);
      const finalHeaders: Record<string, string> = { ...headersInterp };
      if (
        hasBody &&
        !Object.keys(finalHeaders).find((k) => k.toLowerCase() === 'content-type')
      ) {
        finalHeaders['Content-Type'] = 'application/json';
      }

      const res = await undiciFetch(urlInterp, {
        method: node.method,
        headers: finalHeaders,
        body: hasBody ? JSON.stringify(bodyInterp) : undefined,
        signal: ctrl.signal,
        redirect: 'manual',
        dispatcher: agent,
      });

      if (res.status >= 300 && res.status < 400) {
        await drainAndDiscard(res);
        return errorResultStatus(res.status, 'redirect-not-followed', startedAt);
      }

      let body: unknown;
      try {
        body = await readBodyLimited(res, MAX_RESPONSE_BYTES);
      } catch (err) {
        if (err instanceof Error && err.message === 'response-too-large') {
          return errorResultStatus(res.status, 'response-too-large', startedAt);
        }
        throw err;
      }

      const ok = res.status >= 200 && res.status < 300;
      const durationMs = Date.now() - startedAt;
      const result: HttpExecResult = { ok, status: res.status, body, durationMs };

      void this.audit.log({
        action: 'wapi.bot.http.executed',
        resourceType: 'WapiBotHttpNode',
        resourceId: `${options.configId}:${options.nodeId}`,
        metadata: {
          configId: options.configId,
          nodeId: options.nodeId,
          urlHost: parsed.host,
          method: node.method,
          status: res.status,
          ok,
          mode: options.mode,
          durationMs,
        },
        organizationId: options.organizationId,
      });

      return result;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (!isAbort) {
        // Logueamos el detalle (cause.code suele tener ENOTFOUND / ECONNREFUSED / etc).
        const cause = (err as { cause?: { code?: string; message?: string } }).cause;
        this.logger.warn(
          `HTTP fetch error config=${options.configId} node=${options.nodeId}: ` +
            `${(err as Error).message}` +
            (cause ? ` | cause.code=${cause.code ?? '?'} cause.msg=${cause.message ?? '?'}` : ''),
        );
      }
      return errorResult(isAbort ? 'timeout' : 'network-error', 0, startedAt);
    } finally {
      clearTimeout(timer);
      void agent.close().catch(() => {
        /* ignore */
      });
    }
  }

  private executeMock(node: BotHttpNode): HttpExecResult {
    if (!node.mockResponse) {
      return { ok: false, status: 0, body: null, error: 'mock-undefined', durationMs: 0 };
    }
    const status = node.mockResponse.status;
    return {
      ok: status >= 200 && status < 300,
      status,
      body: node.mockResponse.body,
      durationMs: 0,
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function errorResult(code: string, status: number, startedAt = Date.now()): HttpExecResult {
  return { ok: false, status, body: null, error: code, durationMs: Date.now() - startedAt };
}

function errorResultStatus(
  status: number,
  code: string,
  startedAt: number,
): HttpExecResult {
  return { ok: false, status, body: null, error: code, durationMs: Date.now() - startedAt };
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

async function interpolateBodyLeaves(body: unknown, data: BotData): Promise<unknown> {
  if (body === null || body === undefined) return body;
  if (typeof body === 'string') return interpolateAsync(body, data);
  if (typeof body === 'number' || typeof body === 'boolean') return body;
  if (Array.isArray(body)) {
    return Promise.all(body.map((b) => interpolateBodyLeaves(b, data)));
  }
  if (typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = await interpolateBodyLeaves(v, data);
    }
    return out;
  }
  return body;
}

async function readBodyLimited(
  res: Awaited<ReturnType<typeof undiciFetch>>,
  max: number,
): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) return null;
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
  if (total === 0) return null;
  const buf = Buffer.concat(chunks);
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) {
    try {
      return JSON.parse(buf.toString('utf8'));
    } catch {
      return buf.toString('utf8');
    }
  }
  if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('javascript')) {
    return buf.toString('utf8');
  }
  return { binary: true, size: total, contentType: ct };
}

async function drainAndDiscard(res: Awaited<ReturnType<typeof undiciFetch>>): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
}
