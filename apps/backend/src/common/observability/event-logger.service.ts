import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger as WinstonLogger } from 'winston';
import { ObservabilityContext } from './observability-context';
import { TenantContext } from '../auth/tenant-context';

/** Truncado seguro para no inundar logs con bodies largos. */
function truncate(s: string | undefined, n = 80): string | undefined {
  if (s == null) return s;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtValue(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return `"${truncate(v, 40)}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return truncate(JSON.stringify(v), 40) ?? '';
}

type Level = 'info' | 'warn' | 'error';

/**
 * 4.R — Logger de eventos estructurado. Cada método emite una línea Winston
 * con campos consistentes (event, channel, direction, ts) MÁS los correlation
 * IDs del ObservabilityContext + TenantContext actuales (traceId, phone,
 * sessionId, conversationId, configId, organizationId, teamId, userId).
 *
 * En Dozzle se ve como una línea con prefijo emoji + summary humano +
 * todo el JSON estructurado debajo. Buscás por cualquier id (phone, traceId,
 * sessionId) y agarrás todas las líneas relacionadas.
 */
@Injectable()
export class EventLogger {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly winston: WinstonLogger,
  ) {}

  // =====================================================================
  // WAPI (WhatsApp inbound / outbound)
  // =====================================================================

  wapiInbound(fields: {
    phone: string;
    configId?: string;
    type: string;
    body?: string;
    metaMessageId?: string;
    conversationId?: string;
  }): void {
    const body = fields.body ? ` "${truncate(fields.body, 50)}"` : '';
    const msg = `📥 wapi.inbound ${fields.phone} → ${fields.configId ?? '?'} ${fields.type}${body}`;
    this.emit('info', 'wapi.inbound', msg, { direction: 'in', channel: 'wapi', ...fields });
  }

  wapiOutbound(fields: {
    phone: string;
    configId?: string;
    type: string;
    body?: string;
    success: boolean;
    durationMs?: number;
    error?: string;
    metaMessageId?: string;
  }): void {
    const status = fields.success ? 'OK' : `FAIL${fields.error ? ` (${fields.error})` : ''}`;
    const ms = fields.durationMs !== undefined ? ` [${fields.durationMs}ms]` : '';
    const body = fields.body ? ` "${truncate(fields.body, 50)}"` : '';
    const msg = `📤 wapi.outbound ${fields.phone} ← ${fields.type}${body}${ms} ${status}`;
    this.emit(fields.success ? 'info' : 'warn', 'wapi.outbound', msg, {
      direction: 'out',
      channel: 'wapi',
      ...fields,
    });
  }

  // =====================================================================
  // BOT (engine, HTTP node, media fetch)
  // =====================================================================

  botNodeEntered(fields: { nodeId: string; nodeKind: string; topicId?: string }): void {
    const topic = fields.topicId ? `${fields.topicId}/` : '';
    const msg = `🤖 bot.node.entered ${topic}${fields.nodeId} (${fields.nodeKind})`;
    this.emit('info', 'bot.node.entered', msg, { channel: 'bot', ...fields });
  }

  botCapture(fields: { nodeId: string; varName: string; value?: unknown }): void {
    const msg = `🤖 bot.capture node=${fields.nodeId} ${fields.varName}=${fmtValue(fields.value)}`;
    this.emit('info', 'bot.capture', msg, { channel: 'bot', ...fields });
  }

  botSetVar(fields: { nodeId: string; varName: string; value?: unknown }): void {
    const msg = `🤖 bot.setvar node=${fields.nodeId} ${fields.varName}=${fmtValue(fields.value)}`;
    this.emit('info', 'bot.setvar', msg, { channel: 'bot', ...fields });
  }

  botHttpCall(fields: {
    nodeId: string;
    method: string;
    url: string;
    status?: number;
    durationMs?: number;
    error?: string;
    mode?: 'mock' | 'real';
  }): void {
    const failed = !!fields.error || (fields.status !== undefined && fields.status >= 400);
    const ms = fields.durationMs !== undefined ? ` [${fields.durationMs}ms]` : '';
    const err = fields.error ? ` error=${fields.error}` : '';
    const status = fields.status ?? 'ERR';
    const icon = failed ? '⚠️ ' : '🌐';
    const msg = `${icon} bot.http node=${fields.nodeId} ${fields.method} ${truncate(fields.url, 60)} → ${status}${ms}${err}`;
    this.emit(failed ? 'warn' : 'info', 'bot.http', msg, { channel: 'bot', ...fields });
  }

  botMediaFetch(fields: {
    nodeId: string;
    url: string;
    status?: number;
    mediaType?: string;
    durationMs?: number;
    error?: string;
  }): void {
    const failed = !!fields.error || (fields.status !== undefined && fields.status >= 400);
    const ms = fields.durationMs !== undefined ? ` [${fields.durationMs}ms]` : '';
    const err = fields.error ? ` error=${fields.error}` : '';
    const status = fields.status ?? 'ERR';
    const icon = failed ? '⚠️ ' : '🎬';
    const msg = `${icon} bot.media node=${fields.nodeId} GET ${truncate(fields.url, 60)} → ${status}${ms}${err}`;
    this.emit(failed ? 'warn' : 'info', 'bot.media', msg, { channel: 'bot', ...fields });
  }

  botGotoTopic(fields: { from: string; to: string }): void {
    const msg = `🤖 bot.goto ${fields.from} → topic:${fields.to}`;
    this.emit('info', 'bot.goto', msg, { channel: 'bot', ...fields });
  }

  botHandoff(fields: { nodeId: string; escalate?: boolean }): void {
    const tag = fields.escalate ? ' [escalated]' : '';
    const msg = `🤖 bot.handoff node=${fields.nodeId}${tag}`;
    this.emit('info', 'bot.handoff', msg, { channel: 'bot', ...fields });
  }

  botSessionStarted(fields: { sessionId: string; topicId?: string; phone?: string }): void {
    const topic = fields.topicId ? ` topic=${fields.topicId}` : '';
    const msg = `🤖 bot.session.started session=${fields.sessionId}${topic}`;
    this.emit('info', 'bot.session.started', msg, { channel: 'bot', ...fields });
  }

  botSessionEnded(fields: { sessionId: string; reason?: string }): void {
    const reason = fields.reason ? ` reason=${fields.reason}` : '';
    const msg = `🤖 bot.session.ended session=${fields.sessionId}${reason}`;
    this.emit('info', 'bot.session.ended', msg, { channel: 'bot', ...fields });
  }

  // =====================================================================
  // EMAIL (send + SES events)
  // =====================================================================

  emailSend(fields: {
    to: string;
    templateId?: string;
    campaignId?: string;
    smtpAccountId?: string;
    success: boolean;
    smtpMessageId?: string;
    durationMs?: number;
    error?: string;
    transactional?: boolean;
  }): void {
    const status = fields.success ? 'OK' : `FAIL${fields.error ? ` (${fields.error})` : ''}`;
    const ms = fields.durationMs !== undefined ? ` [${fields.durationMs}ms]` : '';
    const id = fields.smtpMessageId ? ` msg=${truncate(fields.smtpMessageId, 24)}` : '';
    const kind = fields.transactional ? 'tx' : fields.campaignId ? 'campaign' : 'send';
    const msg = `📧 email.${kind} → ${fields.to}${id}${ms} ${status}`;
    this.emit(fields.success ? 'info' : 'warn', 'email.send', msg, {
      direction: 'out',
      channel: 'email',
      ...fields,
    });
  }

  emailEvent(fields: {
    type: 'SENT' | 'BOUNCED' | 'COMPLAINED' | 'OPEN' | 'CLICK' | 'DELIVERY' | 'SUPPRESSED';
    email?: string;
    smtpMessageId?: string;
    ip?: string;
    userAgent?: string;
  }): void {
    const dest = fields.email ? ` ${fields.email}` : '';
    const id = fields.smtpMessageId ? ` msg=${truncate(fields.smtpMessageId, 24)}` : '';
    const msg = `📧 email.event ${fields.type}${dest}${id}`;
    this.emit('info', 'email.event', msg, { direction: 'in', channel: 'email', ...fields });
  }

  // =====================================================================
  // WEBHOOK (receivers — Meta, SES, Clerk)
  // =====================================================================

  webhookReceived(fields: {
    provider: string;
    eventType: string;
    eventId?: string;
  }): void {
    const id = fields.eventId ? ` id=${fields.eventId}` : '';
    const msg = `🔔 webhook.received ${fields.provider} ${fields.eventType}${id}`;
    this.emit('info', 'webhook.received', msg, {
      direction: 'in',
      channel: 'webhook',
      ...fields,
    });
  }

  webhookProcessed(fields: {
    provider: string;
    eventType: string;
    success: boolean;
    durationMs?: number;
    error?: string;
  }): void {
    const status = fields.success ? 'OK' : `FAIL${fields.error ? ` (${fields.error})` : ''}`;
    const ms = fields.durationMs !== undefined ? ` [${fields.durationMs}ms]` : '';
    const msg = `🔔 webhook.processed ${fields.provider} ${fields.eventType}${ms} ${status}`;
    this.emit(fields.success ? 'info' : 'warn', 'webhook.processed', msg, {
      direction: 'in',
      channel: 'webhook',
      ...fields,
    });
  }

  // =====================================================================
  // LOW-LEVEL — para eventos custom no cubiertos arriba
  // =====================================================================

  custom(
    level: Level,
    event: string,
    message: string,
    fields: Record<string, unknown> = {},
  ): void {
    this.emit(level, event, message, fields);
  }

  // =====================================================================
  // INTERNALS
  // =====================================================================

  /** Combina campos del scope (ObservabilityContext + TenantContext) con
   *  los del evento y los manda a Winston. Los del evento ganan a los del
   *  scope si hay colisión de keys (raro pero posible — ej: reemplazar
   *  phone). */
  private emit(level: Level, event: string, message: string, payload: Record<string, unknown>) {
    const obs = ObservabilityContext.current();
    const tenant = TenantContext.current();
    const meta = {
      event,
      ...obs,
      ...(tenant
        ? { organizationId: tenant.organizationId, teamId: tenant.teamId, userId: tenant.userId }
        : {}),
      ...payload,
    };
    this.winston[level](message, meta);
  }
}
