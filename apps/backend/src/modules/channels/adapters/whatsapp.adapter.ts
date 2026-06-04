import { Injectable } from '@nestjs/common';
import { WapiSenderService } from '../../wapi/sender/wapi-sender.service';
import type {
  ChannelAdapter,
  ChannelCapabilities,
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
}
