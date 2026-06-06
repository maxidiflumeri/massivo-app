export const INBOX_TABS = ['mine', 'unassigned', 'others', 'resolved', 'all'] as const;
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
