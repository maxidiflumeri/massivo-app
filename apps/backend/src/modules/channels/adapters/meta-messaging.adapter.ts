import { Logger } from '@nestjs/common';
import { WapiSendException } from '../../wapi/sender/wapi-sender.types';
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelKind,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../adapter.types';

/** Conexión que necesita un canal de Meta Messaging (Messenger/Instagram) para
 *  enviar: el id de la página/cuenta y un page access token ya desencriptado. */
export interface MetaMessagingConnection {
  pageId: string;
  accessToken: string;
  isTestMode: boolean;
}

const GRAPH_BASE = process.env.WAPI_GRAPH_BASE_URL || 'https://graph.facebook.com';
const GRAPH_VERSION = 'v20.0';

interface GraphSendOk {
  message_id?: string;
  recipient_id?: string;
}
interface GraphErrorBody {
  error?: { code?: number; error_subcode?: number; message?: string };
}

/** Envelope del webhook de Meta Messaging (Messenger: object 'page'; IG: 'instagram'). */
interface MetaMessagingPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
}
interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    quick_reply?: { payload?: string };
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
    is_echo?: boolean;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  referral?: { ref?: string; source?: string; type?: string };
}

/**
 * Fase 2 — Adapter base para canales de Meta Messaging (Messenger e Instagram
 * comparten la misma Graph API `/me/messages` y el mismo envelope de webhook
 * `entry[].messaging[]`). Las subclases sólo fijan `kind`, el `object` esperado
 * del webhook y, si difieren, las capabilities.
 *
 * `send` mapea el `OutboundMessage` normalizado a la llamada de Graph (text /
 * quick replies / attachment). `parseInbound` traduce el payload crudo a
 * `InboundMessage[]` (parser puro; la firma HMAC y la resolución de tenant viven
 * en el webhook handler del proveedor).
 */
export abstract class MetaMessagingAdapter implements ChannelAdapter<MetaMessagingConnection> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly kind: ChannelKind;
  /** Valor de `payload.object` que acepta este canal (Messenger 'page', IG 'instagram'). */
  protected abstract readonly webhookObject: string;

  readonly capabilities: ChannelCapabilities = {
    // Messenger/IG: quick replies, hasta 13.
    interactiveButtons: { supported: true, max: 13 },
    mediaTypes: ['image', 'audio', 'video', 'file'],
    // Ventana de mensajería estándar de 24h (igual concepto que WhatsApp).
    freeformWindow: { enforced: true, hours: 24 },
    // Sin templates estilo WhatsApp (Messenger usa message tags, fuera de scope).
    templates: false,
  };

  async send(conn: MetaMessagingConnection, msg: OutboundMessage): Promise<SendResult> {
    const body = this.buildSendBody(msg);
    if (conn.isTestMode) {
      const simId = `mid.SIM_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      this.logger.debug(`[isTestMode] short-circuit pageId=${conn.pageId} → ${simId}`);
      return { externalMessageId: simId };
    }
    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(conn.accessToken)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new WapiSendException({
        code: null, subCode: null, message: `network: ${(err as Error).message}`,
        isRateLimit: false, isAuth: false, retryable: true, raw: null,
      });
    }
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const e = (json as GraphErrorBody).error;
      const code = typeof e?.code === 'number' ? e.code : null;
      throw new WapiSendException({
        code, subCode: e?.error_subcode ?? null, message: e?.message ?? `HTTP ${res.status}`,
        isRateLimit: res.status === 429 || code === 613, isAuth: code === 190,
        retryable: res.status === 429 || res.status >= 500, raw: json,
      });
    }
    const id = (json as GraphSendOk).message_id;
    if (!id) {
      throw new WapiSendException({
        code: null, subCode: null, message: 'Graph 200 sin message_id',
        isRateLimit: false, isAuth: false, retryable: false, raw: json,
      });
    }
    return { externalMessageId: id };
  }

  /** Mapea el OutboundMessage normalizado al body de Graph `/me/messages`. */
  private buildSendBody(msg: OutboundMessage): Record<string, unknown> {
    const recipient = { id: msg.to };
    if (msg.kind === 'text') {
      return { recipient, messaging_type: 'RESPONSE', message: { text: msg.text } };
    }
    if (msg.kind === 'buttons') {
      // Messenger no tiene "reply buttons"; el equivalente son quick replies (máx 13).
      const quickReplies = msg.buttons
        .slice(0, this.capabilities.interactiveButtons.max)
        .map((b) => ({ content_type: 'text', title: b.title.slice(0, 20), payload: b.id }));
      return {
        recipient,
        messaging_type: 'RESPONSE',
        message: { text: msg.text, quick_replies: quickReplies },
      };
    }
    // media — Messenger requiere una URL pública (no soporta el media_id de WhatsApp).
    if (!msg.url) {
      throw new Error('MetaMessagingAdapter.send: media requiere `url` pública (Messenger no usa media_id de WhatsApp)');
    }
    return {
      recipient,
      messaging_type: 'RESPONSE',
      message: {
        attachment: {
          type: mapOutboundMediaType(msg.mediaType),
          payload: { url: msg.url, is_reusable: true },
        },
      },
    };
  }

  parseInbound(payload: unknown): InboundMessage[] {
    const p = payload as MetaMessagingPayload | null | undefined;
    if (!p || p.object !== this.webhookObject) return [];
    const out: InboundMessage[] = [];
    for (const entry of p.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const inbound = this.toInbound(ev);
        if (inbound) out.push(inbound);
      }
    }
    return out;
  }

  private toInbound(ev: MetaMessagingEvent): InboundMessage | null {
    const psid = ev.sender?.id;
    if (!psid) return null;
    // Ignorar echoes (mensajes salientes que Meta re-emite) y eventos sin contenido.
    if (ev.message?.is_echo) return null;

    const tsMs = ev.timestamp;
    const timestamp = typeof tsMs === 'number' && Number.isFinite(tsMs) ? new Date(tsMs) : new Date(0);

    // Postback (botón persistente / get-started / template button).
    if (ev.postback) {
      return {
        channelKind: this.kind,
        externalUserId: psid,
        externalMessageId: ev.postback.mid ?? `pb_${psid}_${tsMs ?? 0}`,
        timestamp,
        type: 'interactive_reply',
        interactiveReplyId: ev.postback.payload,
        text: ev.postback.title,
        ...(ev.referral ? { referral: mapReferral(ev.referral) } : {}),
      };
    }

    const m = ev.message;
    if (!m || !m.mid) return null;

    const base = {
      channelKind: this.kind,
      externalUserId: psid,
      externalMessageId: m.mid,
      timestamp,
    };

    // Quick reply → interactive reply.
    if (m.quick_reply) {
      return {
        ...base,
        type: 'interactive_reply',
        interactiveReplyId: m.quick_reply.payload,
        text: m.text,
      };
    }
    // Texto.
    if (typeof m.text === 'string') {
      return { ...base, type: 'text', text: m.text };
    }
    // Adjunto (primer attachment).
    const att = m.attachments?.[0];
    if (att) {
      return {
        ...base,
        type: mapInboundAttachmentType(att.type),
        ...(att.payload?.url ? { media: { url: att.payload.url, mime: '' } } : {}),
      };
    }
    return { ...base, type: 'unknown' };
  }
}

function mapOutboundMediaType(t: string): string {
  switch (t) {
    case 'image': return 'image';
    case 'video': return 'video';
    case 'audio': return 'audio';
    default: return 'file';
  }
}

function mapInboundAttachmentType(t: string | undefined): InboundMessage['type'] {
  switch (t) {
    case 'image': return 'image';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'file': return 'document';
    default: return 'unknown';
  }
}

function mapReferral(r: { ref?: string; source?: string; type?: string }): InboundMessage['referral'] {
  const source = r.type === 'OPEN_THREAD' || r.source === 'SHORTLINK' ? 'link' : 'ad';
  return { payload: r.ref ?? '', source };
}
