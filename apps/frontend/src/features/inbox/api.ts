import type { ApiClient } from '../../api/client';
import type {
  ConversationDetail,
  ConversationListItem,
  InboxMediaType,
  InboxMessage,
  InboxTab,
  ListResult,
  QuickReply,
  ResolutionNoteItem,
} from './types';

export interface ListConversationsParams {
  tab?: InboxTab;
  /** Filtro por canal puntual (una línea/Channel). */
  channelId?: string;
  /** Filtro por tipo de canal (WHATSAPP/INSTAGRAM/…). */
  channelKind?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  priority?: boolean;
  /** Incluir conversaciones manejadas por el bot (no escaladas). Usado por el Chat simulado de dev. */
  includeBotHandled?: boolean;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== false,
  );
  if (entries.length === 0) return '';
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

export const inboxApi = {
  listConversations(api: ApiClient, params: ListConversationsParams = {}) {
    return api.get<ListResult<ConversationListItem>>(
      `/api/inbox/conversations${qs(params)}`,
    );
  },

  getConversation(api: ApiClient, id: string) {
    return api.get<ConversationDetail>(`/api/inbox/conversations/${id}`);
  },

  listMessages(
    api: ApiClient,
    id: string,
    params: { cursor?: string; limit?: number } = {},
  ) {
    return api.get<ListResult<InboxMessage>>(
      `/api/inbox/conversations/${id}/messages${qs(params)}`,
    );
  },

  sendText(api: ApiClient, id: string, body: string, previewUrl = false) {
    return api.post<InboxMessage>(`/api/inbox/conversations/${id}/messages`, {
      body,
      previewUrl,
    });
  },

  sendMedia(
    api: ApiClient,
    id: string,
    file: File,
    type: InboxMediaType,
    caption?: string,
  ) {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('type', type);
    if (caption) form.append('caption', caption);
    return api.postForm<InboxMessage>(
      `/api/inbox/conversations/${id}/media`,
      form,
    );
  },

  /**
   * Devuelve el path absoluto del endpoint para descargar el binario de un
   * mensaje. El consumidor debe usar `api.getBlob(...)` (no construir un
   * `<img src>` directo, porque no se puede pasar el Authorization header).
   */
  mediaPath(messageId: string) {
    return `/api/inbox/messages/${messageId}/media`;
  },

  setRead(api: ApiClient, id: string, read: boolean) {
    return api.post<{ unreadCount: number }>(`/api/inbox/conversations/${id}/read`, {
      read,
    });
  },

  take(api: ApiClient, id: string) {
    return api.post<{ id: string; assignedUserId: string }>(
      `/api/inbox/conversations/${id}/take`,
    );
  },

  assign(api: ApiClient, id: string, userId: string) {
    return api.post<{ id: string; assignedUserId: string }>(
      `/api/inbox/conversations/${id}/assign`,
      { userId },
    );
  },

  unassign(api: ApiClient, id: string) {
    return api.post<{ id: string }>(`/api/inbox/conversations/${id}/unassign`);
  },

  resolve(api: ApiClient, id: string, note?: string) {
    return api.post<{ id: string; resolvedAt: string }>(
      `/api/inbox/conversations/${id}/resolve`,
      note ? { note } : {},
    );
  },

  reopen(api: ApiClient, id: string) {
    return api.post<{ id: string }>(`/api/inbox/conversations/${id}/reopen`);
  },

  hold(api: ApiClient, id: string) {
    return api.post<{ id: string; waitingUntil: string }>(
      `/api/inbox/conversations/${id}/hold`,
    );
  },

  listNotes(api: ApiClient, id: string) {
    return api.get<ResolutionNoteItem[]>(`/api/inbox/conversations/${id}/notes`);
  },
};

export const quickRepliesApi = {
  list(api: ApiClient) {
    return api.get<QuickReply[]>('/api/wapi/quick-replies');
  },
  create(api: ApiClient, input: { shortcut: string; body: string }) {
    return api.post<QuickReply>('/api/wapi/quick-replies', input);
  },
  update(api: ApiClient, id: string, input: { shortcut?: string; body?: string }) {
    return api.patch<QuickReply>(`/api/wapi/quick-replies/${id}`, input);
  },
  remove(api: ApiClient, id: string) {
    return api.delete<void>(`/api/wapi/quick-replies/${id}`);
  },
};
