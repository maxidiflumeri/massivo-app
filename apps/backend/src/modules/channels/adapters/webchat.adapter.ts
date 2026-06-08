import { Injectable } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelKind,
  OutboundMessage,
  SendResult,
} from '../adapter.types';

/** Conexión de un canal Webchat para enviar: sólo el id del canal (el destinatario
 *  —visitorId— viaja en `OutboundMessage.to`). No hay credenciales externas. */
export interface WebchatConnection {
  channelId: string;
}

/**
 * Fase 4 — Adapter de Webchat. A diferencia de WhatsApp/Meta, no hay API externa:
 * "enviar" = empujar el mensaje al socket del visitante (namespace `/webchat`) vía
 * `EventsService`. El motor del bot / el inbox ya persisten el `Message` y emiten el
 * evento al equipo; este adapter sólo entrega al visitante y devuelve un id sintético.
 */
@Injectable()
export class WebchatAdapter implements ChannelAdapter<WebchatConnection> {
  readonly kind: ChannelKind = 'WEBCHAT';

  readonly capabilities: ChannelCapabilities = {
    // El widget es nuestro → renderizamos botones (quick replies) sin límite real de Meta.
    interactiveButtons: { supported: true, max: 10 },
    mediaTypes: ['image', 'file'],
    // Webchat no tiene ventana de 24h: el visitante está conectado en vivo.
    freeformWindow: { enforced: false },
    templates: false,
  };

  constructor(private readonly events: EventsService) {}

  async send(conn: WebchatConnection, msg: OutboundMessage): Promise<SendResult> {
    const id = `wc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    this.events.emitToWebchatVisitor(conn.channelId, msg.to, 'message', toVisitorPayload(msg, id));
    return { externalMessageId: id };
  }
}

/** Mapea el OutboundMessage normalizado al payload que entiende el widget. Para el
 *  visitante, los mensajes del bot/operador son "entrantes" (direction 'in'). */
function toVisitorPayload(msg: OutboundMessage, id: string): Record<string, unknown> {
  const base = { id, direction: 'in', timestamp: new Date().toISOString() };
  if (msg.kind === 'text') {
    return { ...base, type: 'text', text: msg.text };
  }
  if (msg.kind === 'buttons') {
    return {
      ...base,
      type: 'buttons',
      text: msg.text,
      buttons: msg.buttons.map((b) => ({ id: b.id, title: b.title })),
    };
  }
  return {
    ...base,
    type: 'media',
    mediaType: msg.mediaType,
    url: msg.url,
    caption: msg.caption,
  };
}
