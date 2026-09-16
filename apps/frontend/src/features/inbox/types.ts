// `all` = todo lo abierto (sin RESOLVED). `any` = sin filtro de status, lo usa
// Monitoreo; el inbox nunca lo manda.
export const INBOX_TABS = ['mine', 'unassigned', 'others', 'resolved', 'all', 'any'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export type ConversationStatus = 'UNASSIGNED' | 'ASSIGNED' | 'WAITING' | 'RESOLVED';

// Tipos de canal soportados (espeja el enum `ChannelType` del backend / el union
// de adapter.types.ts). Multi-canal: hoy sólo WHATSAPP está vivo.
export type ChannelKind = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEBCHAT';

export interface ConversationListItem {
  id: string;
  channelId: string;
  channelKind: ChannelKind;
  externalUserId: string;
  name: string | null;
  status: ConversationStatus;
  assignedUserId: string | null;
  lastAssignedUserId: string | null;
  waitingUntil: string | null;
  lastMessageAt: string | null;
  freeformWindowAt: string | null;
  unreadCount: number;
  campaignName: string | null;
  resolvedAt: string | null;
  priority: boolean;
  /** Monitoreo — false = la atendió el bot, true = se escaló a un operador. */
  escalated: boolean;
  lastMessage: {
    fromMe: boolean;
    type: string;
    preview: string;
    timestamp: string;
  } | null;
}

export interface ConversationDetail extends ConversationListItem {
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  fromMe: boolean;
  type: string;
  content: unknown;
  status: string;
  timestamp: string;
  externalId: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;
}

export const INBOX_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
export type InboxMediaType = (typeof INBOX_MEDIA_TYPES)[number];

export interface ResolutionNoteItem {
  id: string;
  note: string;
  authorUserId: string | null;
  /** null = nota del sistema (ej. cierre por inactividad). */
  authorName: string | null;
  createdAt: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConversationMessageNewEvent {
  conversationId: string;
  channelId: string;
  channelKind?: ChannelKind;
  externalUserId?: string;
  message: InboxMessage;
}

/** Cambio de estado de un saliente (tildes): sent → delivered → read, o failed. */
export interface ConversationMessageStatusEvent {
  conversationId: string;
  channelId: string;
  messageId: string;
  status: string;
}

export interface ConversationUpdatedEvent {
  id: string;
  channelId?: string;
  channelKind?: ChannelKind;
  externalUserId?: string;
  status?: ConversationStatus;
  assignedUserId?: string | null;
  lastAssignedUserId?: string | null;
  waitingUntil?: string | null;
  lastMessageAt?: string | null;
  resolvedAt?: string | null;
  unreadCount?: number;
  priority?: boolean;
}
