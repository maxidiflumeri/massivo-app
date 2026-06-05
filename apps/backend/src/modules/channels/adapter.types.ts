/**
 * Fase 1 (multi-canal) — Tipos de la abstracción de canal.
 *
 * Un `ChannelAdapter` encapsula TODO lo específico de una plataforma (WhatsApp,
 * Instagram, Messenger, Webchat). El resto del sistema (motor del bot, inbox,
 * webhook) habla sólo con estos tipos normalizados. Es el mismo patrón que ya
 * usa Email (`EmailSender` + `SesSender`/`SmtpSender`), generalizado.
 */

export type ChannelKind = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEBCHAT';

/** Mensaje entrante normalizado (1c lo produce desde webhooks/WS). */
export interface InboundMessage {
  channelKind: ChannelKind;
  /** Id del que escribe (phone para WA, scoped-id para IG, session-id para webchat). */
  externalUserId: string;
  /** Id del mensaje en el proveedor — para idempotencia. */
  externalMessageId: string;
  timestamp: Date;

  type:
    | 'text'
    | 'interactive_reply'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'location'
    | 'unknown';
  text?: string;
  /** Cuando el usuario toca un botón/quick-reply. */
  interactiveReplyId?: string;
  media?: {
    id?: string;
    url?: string;
    mime: string;
    sha256?: string;
    filename?: string;
    caption?: string;
  };
  /** Contexto de entrada/routing — generaliza el template-payload de WhatsApp. */
  referral?: { payload: string; source: 'ad' | 'template' | 'link' | 'menu' };
  senderProfile?: { name?: string; avatarUrl?: string };
}

/** Mensaje saliente normalizado (lo que el motor/inbox quieren mandar). */
export type OutboundMessage =
  | { kind: 'text'; to: string; text: string; previewUrl?: boolean }
  | {
      kind: 'buttons';
      to: string;
      text: string;
      header?: string;
      footer?: string;
      buttons: Array<{ id: string; title: string }>;
    }
  | {
      kind: 'media';
      to: string;
      mediaType: string;
      mediaId?: string;
      url?: string;
      caption?: string;
      filename?: string;
    };

export interface SendResult {
  /** Id del mensaje en el proveedor (wamid en WhatsApp). */
  externalMessageId: string;
}

/** Qué sabe hacer cada canal — el motor/inbox lo consultan antes de enviar. */
export interface ChannelCapabilities {
  interactiveButtons: { supported: boolean; max: number };
  mediaTypes: string[];
  /** Ventana de "freeform" del canal (WA/IG/Messenger: 24h; webchat: sin ventana). */
  freeformWindow: { enforced: boolean; hours?: number };
  /** Soporte de templates (outbound fuera de ventana) — sólo WhatsApp. */
  templates: boolean;
}

/**
 * Adapter de canal. Genérico en el tipo de conexión/credenciales `Conn` que cada
 * canal necesita para enviar (cada adapter conoce su propio shape).
 *
 * INBOUND (1c): `parseInbound` traduce el payload crudo del proveedor (ya
 * parseado a objeto) a `InboundMessage[]` normalizados. Es un **parser puro**: no
 * verifica firma ni toca DB (la verificación de firma y la resolución de
 * tenant/credenciales viven en el handler del webhook, que es específico del
 * proveedor mientras no exista el modelo `Channel` unificado — eso llega en 1d).
 * El diseño final lo fusiona en `verifyAndParse(req, channel)`; por ahora el
 * parseo se aísla acá y se testea solo. Devuelve `[]` si el payload no trae
 * mensajes entrantes (p.ej. sólo status updates).
 */
export interface ChannelAdapter<Conn = unknown> {
  readonly kind: ChannelKind;
  readonly capabilities: ChannelCapabilities;
  send(conn: Conn, msg: OutboundMessage): Promise<SendResult>;
  parseInbound?(payload: unknown): InboundMessage[];
}
