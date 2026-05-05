import type { ApiClient } from '../../../api/client';
import type {
  InboxTab,
  ListResult,
  WapiConversationDetail,
  WapiConversationListItem,
  WapiInboxMediaType,
  WapiInboxMessage,
  WapiQuickReply,
  WapiResolutionNoteItem,
} from './types';

export interface ListConversationsParams {
  tab?: InboxTab;
  configId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  priority?: boolean;
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
    return api.get<ListResult<WapiConversationListItem>>(
      `/api/wapi/inbox/conversations${qs(params)}`,
    );
  },

  getConversation(api: ApiClient, id: string) {
    return api.get<WapiConversationDetail>(`/api/wapi/inbox/conversations/${id}`);
  },

  listMessages(
    api: ApiClient,
    id: string,
    params: { cursor?: string; limit?: number } = {},
  ) {
    return api.get<ListResult<WapiInboxMessage>>(
      `/api/wapi/inbox/conversations/${id}/messages${qs(params)}`,
    );
  },

  sendText(api: ApiClient, id: string, body: string, previewUrl = false) {
    return api.post<WapiInboxMessage>(`/api/wapi/inbox/conversations/${id}/messages`, {
      body,
      previewUrl,
    });
  },

  sendMedia(
    api: ApiClient,
    id: string,
    file: File,
    type: WapiInboxMediaType,
    caption?: string,
  ) {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('type', type);
    if (caption) form.append('caption', caption);
    return api.postForm<WapiInboxMessage>(
      `/api/wapi/inbox/conversations/${id}/media`,
      form,
    );
  },

  /**
   * Devuelve el path absoluto del endpoint para descargar el binario de un
   * mensaje. El consumidor debe usar `api.getBlob(...)` (no construir un
   * `<img src>` directo, porque no se puede pasar el Authorization header).
   */
  mediaPath(messageId: string) {
    return `/api/wapi/inbox/messages/${messageId}/media`;
  },

  setRead(api: ApiClient, id: string, read: boolean) {
    return api.post<{ unreadCount: number }>(`/api/wapi/inbox/conversations/${id}/read`, {
      read,
    });
  },

  take(api: ApiClient, id: string) {
    return api.post<{ id: string; assignedUserId: string }>(
      `/api/wapi/inbox/conversations/${id}/take`,
    );
  },

  assign(api: ApiClient, id: string, userId: string) {
    return api.post<{ id: string; assignedUserId: string }>(
      `/api/wapi/inbox/conversations/${id}/assign`,
      { userId },
    );
  },

  unassign(api: ApiClient, id: string) {
    return api.post<{ id: string }>(`/api/wapi/inbox/conversations/${id}/unassign`);
  },

  resolve(api: ApiClient, id: string, note?: string) {
    return api.post<{ id: string; resolvedAt: string }>(
      `/api/wapi/inbox/conversations/${id}/resolve`,
      note ? { note } : {},
    );
  },

  reopen(api: ApiClient, id: string) {
    return api.post<{ id: string }>(`/api/wapi/inbox/conversations/${id}/reopen`);
  },

  listNotes(api: ApiClient, id: string) {
    return api.get<WapiResolutionNoteItem[]>(`/api/wapi/inbox/conversations/${id}/notes`);
  },
};

export const quickRepliesApi = {
  list(api: ApiClient) {
    return api.get<WapiQuickReply[]>('/api/wapi/quick-replies');
  },
  create(api: ApiClient, input: { shortcut: string; body: string }) {
    return api.post<WapiQuickReply>('/api/wapi/quick-replies', input);
  },
  update(api: ApiClient, id: string, input: { shortcut?: string; body?: string }) {
    return api.patch<WapiQuickReply>(`/api/wapi/quick-replies/${id}`, input);
  },
  remove(api: ApiClient, id: string) {
    return api.delete<void>(`/api/wapi/quick-replies/${id}`);
  },
};
