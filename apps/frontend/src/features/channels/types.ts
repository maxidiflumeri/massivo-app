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
  /** Bot conectado (null si ninguno). */
  botId: string | null;
}

export interface CreateChannelPayload {
  kind: ChannelKind;
  name?: string;
  // WhatsApp
  phoneNumberId?: string;
  businessAccountId?: string;
  // Messenger/Instagram
  pageId?: string;
  // Compartidos (Meta)
  accessToken: string;
  webhookVerifyToken: string;
  appSecret?: string;
  isTestMode?: boolean;
}
