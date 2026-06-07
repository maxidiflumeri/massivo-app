import type { ApiClient } from '../../api/client';
import type { ChannelListItem, CreateChannelPayload, UpdateChannelPayload } from './types';

/** Fase 2 — gestión de canales (todos los kinds) sobre `/api/channels`. */
export const channelsApi = {
  list(api: ApiClient, kind?: string) {
    return api.get<ChannelListItem[]>(`/api/channels${kind ? `?kind=${kind}` : ''}`);
  },
  create(api: ApiClient, payload: CreateChannelPayload) {
    return api.post<ChannelListItem>('/api/channels', payload);
  },
  update(api: ApiClient, id: string, payload: UpdateChannelPayload) {
    return api.patch<ChannelListItem>(`/api/channels/${id}`, payload);
  },
  setActive(api: ApiClient, id: string, isActive: boolean) {
    return api.patch<ChannelListItem>(`/api/channels/${id}`, { isActive });
  },
  remove(api: ApiClient, id: string) {
    return api.delete<void>(`/api/channels/${id}`);
  },
};
