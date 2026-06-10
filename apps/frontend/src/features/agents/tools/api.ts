import type { ApiClient } from '../../../api/client';
import type { AgentTool, AgentToolPayload } from './types';

/** CRUD de tools del team (`/api/agent-tools`) + asignación m2m al agente. */
export const agentToolsApi = {
  list(api: ApiClient) {
    return api.get<AgentTool[]>('/api/agent-tools');
  },
  get(api: ApiClient, id: string) {
    return api.get<AgentTool>(`/api/agent-tools/${id}`);
  },
  create(api: ApiClient, payload: AgentToolPayload) {
    return api.post<AgentTool>('/api/agent-tools', payload);
  },
  update(api: ApiClient, id: string, payload: Partial<AgentToolPayload>) {
    return api.patch<AgentTool>(`/api/agent-tools/${id}`, payload);
  },
  remove(api: ApiClient, id: string) {
    return api.delete<void>(`/api/agent-tools/${id}`);
  },

  /** Tools asignadas a un agente (ids), para los checkboxes del editor. */
  listForAgent(api: ApiClient, agentId: string) {
    return api.get<{ toolIds: string[] }>(`/api/agents/${agentId}/tools`);
  },
  /** Reemplaza el set completo de tools del agente (semántica PUT). */
  setForAgent(api: ApiClient, agentId: string, toolIds: string[]) {
    return api.put<{ toolIds: string[] }>(`/api/agents/${agentId}/tools`, { toolIds });
  },
};
