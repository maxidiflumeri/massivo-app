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
}

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
}
