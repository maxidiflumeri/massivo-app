import type { ChannelKind } from './types';

/**
 * Fase 1e — capabilities de canal del lado del cliente. Espeja
 * `ChannelCapabilities` del backend (apps/backend/.../channels/adapter.types.ts).
 * El composer las consulta para decidir qué mostrar (banner de ventana sólo en
 * canales con `freeformWindow.enforced`, límite de botones, etc.). Con un solo
 * canal vivo (WHATSAPP) el comportamiento es idéntico al de hoy.
 */
export interface FrontChannelCapabilities {
  /** Ventana de freeform: WA/IG/Messenger 24h; webchat sin ventana. */
  freeformWindow: { enforced: boolean; hours?: number };
  interactiveButtons: { supported: boolean; max: number };
  /** Templates (outbound fuera de ventana) — sólo WhatsApp. */
  templates: boolean;
}

export const CHANNEL_CAPABILITIES: Record<ChannelKind, FrontChannelCapabilities> = {
  WHATSAPP: {
    freeformWindow: { enforced: true, hours: 24 },
    interactiveButtons: { supported: true, max: 3 },
    templates: true,
  },
  INSTAGRAM: {
    freeformWindow: { enforced: true, hours: 24 },
    interactiveButtons: { supported: true, max: 3 },
    templates: false,
  },
  MESSENGER: {
    freeformWindow: { enforced: true, hours: 24 },
    interactiveButtons: { supported: true, max: 3 },
    templates: false,
  },
  WEBCHAT: {
    freeformWindow: { enforced: false },
    interactiveButtons: { supported: true, max: 13 },
    templates: false,
  },
};

export function capabilitiesFor(kind: ChannelKind | null | undefined): FrontChannelCapabilities {
  return (kind && CHANNEL_CAPABILITIES[kind]) || CHANNEL_CAPABILITIES.WHATSAPP;
}

export const CHANNEL_LABELS: Record<ChannelKind, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEBCHAT: 'Webchat',
};

export function channelLabel(kind: ChannelKind): string {
  return CHANNEL_LABELS[kind] ?? kind;
}
