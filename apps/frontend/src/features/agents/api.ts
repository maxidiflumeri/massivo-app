import type { ApiClient } from '../../api/client';
import type { Agent, UpdateAgentPayload } from './types';

export const agentsApi = {
  list(api: ApiClient) {
    return api.get<Agent[]>('/api/agents');
  },
  get(api: ApiClient, id: string) {
    return api.get<Agent>(`/api/agents/${id}`);
  },
  create(api: ApiClient, name: string) {
    return api.post<Agent>('/api/agents', { name });
  },
  update(api: ApiClient, id: string, payload: UpdateAgentPayload) {
    return api.patch<Agent>(`/api/agents/${id}`, payload);
  },
  remove(api: ApiClient, id: string) {
    return api.delete<{ id: string }>(`/api/agents/${id}`);
  },
  connect(api: ApiClient, id: string, channelId: string) {
    return api.post<{ id: string; agentId: string }>(`/api/agents/${id}/connect`, { channelId });
  },
  disconnect(api: ApiClient, id: string, channelId: string) {
    return api.post<{ id: string }>(`/api/agents/${id}/disconnect`, { channelId });
  },
};
