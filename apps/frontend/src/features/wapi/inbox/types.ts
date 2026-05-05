export const INBOX_TABS = ['mine', 'unassigned', 'others', 'resolved', 'all'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export type WapiConversationStatus = 'UNASSIGNED' | 'ASSIGNED' | 'RESOLVED';

export interface WapiConversationListItem {
  id: string;
  configId: string;
  phone: string;
  name: string | null;
  status: WapiConversationStatus;
  assignedUserId: string | null;
  lastMessageAt: string | null;
  window24hAt: string | null;
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

export interface WapiConversationDetail extends WapiConversationListItem {
  createdAt: string;
  updatedAt: string;
}

export interface WapiInboxMessage {
  id: string;
  fromMe: boolean;
  type: string;
  content: unknown;
  status: string;
  timestamp: string;
  metaMessageId: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;
}

export const WAPI_INBOX_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
export type WapiInboxMediaType = (typeof WAPI_INBOX_MEDIA_TYPES)[number];

export interface WapiResolutionNoteItem {
  id: string;
  note: string;
  authorUserId: string | null;
  createdAt: string;
}

export interface WapiQuickReply {
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

export interface WapiMessageNewEvent {
  conversationId: string;
  configId: string;
  phone?: string;
  message: WapiInboxMessage;
}

export interface WapiConversationUpdatedEvent {
  id: string;
  configId?: string;
  phone?: string;
  status?: WapiConversationStatus;
  assignedUserId?: string | null;
  lastMessageAt?: string | null;
  resolvedAt?: string | null;
  unreadCount?: number;
  priority?: boolean;
}
