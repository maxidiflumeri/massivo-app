import type { ApiClient } from '../../api/client';
import type { ChannelListItem, CreateChannelPayload, UpdateChannelPayload } from './types';

/** URL de callback del webhook para un canal: `{backend}/api/channels/{kind}/{slug}`.
 *  El slug es org-scoped (mismo para toda la org); el kind cambia por canal, así que
 *  WhatsApp/Messenger/Instagram tienen cada uno su URL. */
export function channelWebhookUrl(baseUrl: string, kind: string, slug: string): string {
  return `${baseUrl}/api/channels/${kind.toLowerCase()}/${slug}`;
}

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
  /** Revela el verify token en claro (OWNER/ADMIN). Aplica a cualquier kind. */
  revealSecrets(api: ApiClient, id: string) {
    return api.get<{ webhookVerifyToken: string }>(`/api/channels/${id}/reveal-secrets`);
  },
  setActive(api: ApiClient, id: string, isActive: boolean) {
    return api.patch<ChannelListItem>(`/api/channels/${id}`, { isActive });
  },
  remove(api: ApiClient, id: string) {
    return api.delete<void>(`/api/channels/${id}`);
  },
};
