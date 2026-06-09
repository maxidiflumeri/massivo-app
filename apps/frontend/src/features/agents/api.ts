import type { ApiClient } from '../../api/client';
import type { Agent, AgentDocument, UpdateAgentPayload } from './types';

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

  // Base de conocimiento (RAG).
  documents: {
    list(api: ApiClient, agentId: string) {
      return api.get<AgentDocument[]>(`/api/agents/${agentId}/documents`);
    },
    addText(api: ApiClient, agentId: string, name: string, text: string) {
      return api.post<AgentDocument>(`/api/agents/${agentId}/documents/text`, { name, text });
    },
    upload(api: ApiClient, agentId: string, file: File) {
      const form = new FormData();
      form.append('file', file);
      return api.postForm<AgentDocument>(`/api/agents/${agentId}/documents/upload`, form);
    },
    remove(api: ApiClient, agentId: string, docId: string) {
      return api.delete<{ id: string }>(`/api/agents/${agentId}/documents/${docId}`);
    },
  },
};
