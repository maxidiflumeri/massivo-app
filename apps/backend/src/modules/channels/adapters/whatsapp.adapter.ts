import { Injectable } from '@nestjs/common';
import { WapiSenderService } from '../../wapi/sender/wapi-sender.service';
import type {
  WapiWebhookMessage,
  WapiWebhookPayload,
  WapiWebhookValue,
} from '../../wapi/webhook/wapi-webhook.types';
import type {
  ChannelAdapter,
  ChannelCapabilities,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../adapter.types';

/** Conexión que el adapter de WhatsApp necesita para enviar (token ya desencriptado). */
export interface WhatsAppConnection {
  phoneNumberId: string;
  accessToken: string;
  isTestMode: boolean;
}

/**
 * Fase 1 — Adapter de WhatsApp (Meta Cloud API). Envuelve `WapiSenderService` y
 * mapea el `OutboundMessage` normalizado a la llamada concreta de Meta. Es un
 * re-empaque: NO agrega lógica nueva de envío, sólo traduce.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter<WhatsAppConnection> {
  readonly kind = 'WHATSAPP' as const;

  readonly capabilities: ChannelCapabilities = {
    interactiveButtons: { supported: true, max: 3 }, // Meta: máx 3 botones reply
    mediaTypes: ['image', 'video', 'audio', 'document'],
    freeformWindow: { enforced: true, hours: 24 },
    templates: true,
  };

  constructor(private readonly sender: WapiSenderService) {}

  async send(conn: WhatsAppConnection, msg: OutboundMessage): Promise<SendResult> {
    const cfg = {
      phoneNumberId: conn.phoneNumberId,
      accessToken: conn.accessToken,
      isTestMode: conn.isTestMode,
    };

    if (msg.kind === 'text') {
      const r = await this.sender.sendText(cfg, {
        to: msg.to,
        body: msg.text,
        previewUrl: msg.previewUrl ?? false,
      });
      return { externalMessageId: r.metaMessageId };
    }

    if (msg.kind === 'buttons') {
      // Capability clamp: Meta sólo soporta hasta `max` botones reply.
      const buttons = msg.buttons.slice(0, this.capabilities.interactiveButtons.max);
      const r = await this.sender.sendInteractiveButtons(cfg, {
        to: msg.to,
        body: msg.text,
        header: msg.header,
        footer: msg.footer,
        buttons,
      });
      return { externalMessageId: r.metaMessageId };
    }

    // media
    if (!msg.mediaId) {
      throw new Error('WhatsAppAdapter.send: media requiere mediaId (subido a Meta)');
    }
    const r = await this.sender.sendMediaById(cfg, {
      to: msg.to,
      // El OutboundMessage genérico lleva mediaType como string; el adapter lo
      // estrecha al union de tipos de media que soporta WhatsApp/Meta.
      type: msg.mediaType as 'image' | 'document' | 'video' | 'audio' | 'sticker',
      mediaId: msg.mediaId,
      caption: msg.caption,
      filename: msg.filename,
    });
    return { externalMessageId: r.metaMessageId };
  }

  /**
   * 1c — Parser puro: payload crudo del webhook de Meta → `InboundMessage[]`
   * normalizados. NO verifica firma ni toca DB (eso vive en el handler del
   * webhook). Recorre `entry[].changes[].value.messages[]`; cada mensaje del
   * cliente se traduce a un `InboundMessage`. Eventos sin mensajes (status
   * updates, etc.) producen `[]`. El nombre del contacto (a nivel `value`) se
   * matchea por `wa_id`/`from` y se adjunta como `senderProfile`.
   */
  parseInbound(payload: unknown): InboundMessage[] {
    const p = payload as WapiWebhookPayload | null | undefined;
    if (!p || p.object !== 'whatsapp_business_account') return [];
    const out: InboundMessage[] = [];
    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        out.push(...this.parseValue(change.value));
      }
    }
    return out;
  }

  private parseValue(value: WapiWebhookValue | undefined): InboundMessage[] {
    if (!value || !Array.isArray(value.messages)) return [];
    const profileByWaId = new Map<string, string>();
    for (const c of value.contacts ?? []) {
      if (c.wa_id && c.profile?.name) profileByWaId.set(c.wa_id, c.profile.name);
    }
    const result: InboundMessage[] = [];
    for (const msg of value.messages) {
      result.push(toInbound(msg, profileByWaId.get(msg.from)));
    }
    return result;
  }
}

/** Mapea un mensaje crudo de Meta al `InboundMessage` normalizado. */
function toInbound(msg: WapiWebhookMessage, profileName: string | undefined): InboundMessage {
  const tsMs = Number(msg.timestamp) * 1000;
  const inbound: InboundMessage = {
    channelKind: 'WHATSAPP',
    externalUserId: msg.from,
    externalMessageId: msg.id,
    timestamp: Number.isFinite(tsMs) ? new Date(tsMs) : new Date(0),
    type: mapType(msg.type),
  };
  if (profileName) inbound.senderProfile = { name: profileName };

  if (msg.type === 'text') {
    inbound.text = msg.text?.body;
    return inbound;
  }

  // Botón interactivo (quick reply del bot o de un template interactive).
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    inbound.interactiveReplyId = msg.interactive.button_reply.id;
    inbound.text = msg.interactive.button_reply.title;
    return inbound;
  }
  if (msg.type === 'interactive' && msg.interactive?.list_reply) {
    inbound.interactiveReplyId = msg.interactive.list_reply.id;
    inbound.text = msg.interactive.list_reply.title;
    return inbound;
  }
  // Botón de template aprobado (CTA legacy): el payload generaliza a `referral`
  // con source 'template' (mismo mecanismo que el router consume para arrancar
  // un tema desde un payload externo).
  if (msg.type === 'button' && msg.button) {
    inbound.interactiveReplyId = msg.button.payload;
    inbound.text = msg.button.text;
    inbound.referral = { payload: msg.button.payload, source: 'template' };
    return inbound;
  }

  const media = mapMedia(msg);
  if (media) inbound.media = media;
  return inbound;
}

function mapType(metaType: string): InboundMessage['type'] {
  switch (metaType) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'document':
      return 'document';
    case 'location':
      return 'location';
    case 'interactive':
    case 'button':
      return 'interactive_reply';
    // sticker, reaction, contacts, etc. no tienen mapeo directo en el union.
    default:
      return 'unknown';
  }
}

function mapMedia(msg: WapiWebhookMessage): InboundMessage['media'] | null {
  switch (msg.type) {
    case 'image':
      if (!msg.image) return null;
      return { id: msg.image.id, mime: msg.image.mime_type ?? '', sha256: msg.image.sha256, caption: msg.image.caption };
    case 'audio':
      if (!msg.audio) return null;
      return { id: msg.audio.id, mime: msg.audio.mime_type ?? '', sha256: msg.audio.sha256 };
    case 'video':
      if (!msg.video) return null;
      return { id: msg.video.id, mime: msg.video.mime_type ?? '', sha256: msg.video.sha256, caption: msg.video.caption };
    case 'document':
      if (!msg.document) return null;
      return {
        id: msg.document.id,
        mime: msg.document.mime_type ?? '',
        filename: msg.document.filename,
        caption: msg.document.caption,
      };
    case 'sticker':
      if (!msg.sticker) return null;
      return { id: msg.sticker.id, mime: msg.sticker.mime_type ?? '', sha256: msg.sticker.sha256 };
    default:
      return null;
  }
}
