import type { ChannelKind } from './channelMeta';

/** Item de la lista de canales (shape del backend ChannelListItem). */
export interface ChannelListItem {
  id: string;
  name: string | null;
  kind: ChannelKind;
  /** WhatsApp. */
  phoneNumberId: string;
  /** Messenger/Instagram. */
  pageId: string | null;
  businessAccountId: string;
  isActive: boolean;
  isTestMode: boolean;
  createdAt: string;
  /** Bot conectado (null si ninguno). Excluyente con agentId. */
  botId: string | null;
  /** Agente IA conectado (null si ninguno). Excluyente con botId. */
  agentId: string | null;
}

export interface CreateChannelPayload {
  kind: ChannelKind;
  name?: string;
  // WhatsApp
  phoneNumberId?: string;
  businessAccountId?: string;
  // Messenger/Instagram
  pageId?: string;
  // Compartidos (Meta) — opcionales: Webchat no usa credenciales externas.
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  isTestMode?: boolean;
}

/** Detalle de un canal (incluye los settings WhatsApp-específicos editables). */
export interface ChannelDetail extends ChannelListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  optOutKeywords: string[];
  dailyLimit: number;
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
  updatedAt: string;
}

/** Update parcial: las credenciales sólo se mandan si el usuario las cambió. */
export interface UpdateChannelPayload {
  name?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  pageId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  isTestMode?: boolean;
  isActive?: boolean;
  // WhatsApp-específicos (auto-replies + throttle), antes en la página Números.
  welcomeMessage?: string | null;
  optOutConfirmMessage?: string | null;
  optOutKeywords?: string[];
  dailyLimit?: number;
  sendDelayMinMs?: number;
  sendDelayMaxMs?: number;
}
