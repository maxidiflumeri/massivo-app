import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../auth/tenant-context';
import { ObservabilityContext } from '../observability/observability-context';
import { sanitize } from '../audit/audit-log.service';

/** Cada cuánto se vacía el buffer a la DB. */
const FLUSH_MS = 500;
/** Techo del buffer en memoria. Si se llena, se dropean los más viejos. */
const MAX_BUFFER = 1000;
/** Filas por INSERT. Un inbound con FOREACH puede generar decenas de eventos. */
const BATCH_SIZE = 500;
/** Los valores de payload se recortan a esto (nunca guardamos bodies enteros). */
const MAX_VALUE_CHARS = 120;

/** Nombres de evento, iguales a los del log estructurado (EventLogger). */
export type BotEventKind =
  | 'bot.session.started'
  | 'bot.session.ended'
  | 'bot.node.entered'
  | 'bot.capture'
  | 'bot.capture.invalid'
  | 'bot.setvar'
  | 'bot.http'
  | 'bot.media'
  | 'bot.goto'
  | 'bot.handoff';

export interface BotEventInput {
  kind: BotEventKind;
  nodeId?: string | null;
  nodeKind?: string | null;
  topicId?: string | null;
  payload?: Record<string, unknown> | null;
  /** Override del contexto (rara vez necesario). */
  conversationId?: string | null;
  channelId?: string | null;
  sessionId?: string | null;
}

/**
 * Monitoreo — persiste el recorrido del bot (nodo a nodo) en `BotEvent` para el
 * replay del panel. Complementa al `EventLogger`, que sigue mandando lo mismo a
 * stdout: acá guardamos SOLO los eventos `bot.*`, que son los únicos que no se
 * pueden reconstruir desde `Message`.
 *
 * Filosofía (igual que `AuditLogService`): fire-and-forget. `record()` es
 * sincrónico — encola en memoria y vuelve — y un flush fallido se descarta con
 * un warning. El monitoreo nunca debe frenar ni romper la conversación.
 *
 * Escribe con el cliente root (no `scoped`) porque setea `organizationId`/
 * `teamId` explícitamente desde el `TenantContext`. Las lecturas del panel sí
 * van por `scoped` (BotEvent está en TENANT_SCOPED_MODELS).
 */
@Injectable()
export class BotEventRecorder implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotEventRecorder.name);
  private buffer: Prisma.BotEventCreateManyInput[] = [];
  private timer: NodeJS.Timeout | null = null;
  private dropped = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /**
   * Encola un evento. Toma org/team del TenantContext y la correlación
   * (conversationId/sessionId/channelId) del ObservabilityContext, que el
   * webhook y el engine ya vienen poblando.
   */
  record(input: BotEventInput): void {
    const tenant = TenantContext.current();
    if (!tenant?.organizationId || !tenant?.teamId) {
      // Sin scope de tenant no hay dónde guardarlo. Pasa en paths que aún no
      // resolvieron la org (webhooks públicos) — no es un error.
      this.logger.debug(`evento ${input.kind} descartado: sin TenantContext`);
      return;
    }
    const obs = ObservabilityContext.current();
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.dropped += 1;
      if (this.dropped % 100 === 1) {
        this.logger.warn(`buffer lleno (${MAX_BUFFER}), descartando eventos viejos`);
      }
    }
    this.buffer.push({
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      conversationId: input.conversationId ?? obs.conversationId ?? null,
      channelId: input.channelId ?? obs.configId ?? null,
      sessionId: input.sessionId ?? obs.sessionId ?? null,
      kind: input.kind,
      nodeId: input.nodeId ?? null,
      nodeKind: input.nodeKind ?? null,
      topicId: input.topicId ?? null,
      payload: input.payload
        ? (sanitize(truncateValues(input.payload)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      // Se estampa acá y no en el flush: el orden del timeline es el de emisión.
      createdAt: new Date(),
    });
  }

  /** Vacía el buffer. Idempotente y seguro de llamar en paralelo. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const pending = this.buffer;
    this.buffer = [];
    try {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        await this.prisma.botEvent.createMany({ data: pending.slice(i, i + BATCH_SIZE) });
      }
    } catch (err) {
      // Se descartan a propósito: reencolar podría amplificar un problema de DB.
      this.logger.warn(
        `flush de ${pending.length} bot events falló: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/** Recorta strings largos del payload. Objetos/arrays se serializan y recortan. */
function truncateValues(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      out[k] = trim(v);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else {
      out[k] = trim(safeStringify(v));
    }
  }
  return out;
}

function trim(s: string): string {
  return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS)}…` : s;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return '[unserializable]';
  }
}
