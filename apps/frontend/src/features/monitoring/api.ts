import type { ApiClient } from '../../api/client';
import type { ListResult } from '../inbox/types';
import type {
  BotEventItem,
  EpisodeItem,
  BotSessionSnapshot,
  MonitoringOverview,
  MonitoringWindow,
} from './types';

/**
 * Monitoreo — sólo lo que el inbox no expone. La lista de conversaciones y sus
 * mensajes se piden con `inboxApi` (`includeBotHandled: true`), para no duplicar
 * endpoints ni lógica de permisos.
 */
export const monitoringApi = {
  overview(api: ApiClient, days: MonitoringWindow) {
    return api.get<MonitoringOverview>(`/api/monitoring/metrics/overview?days=${days}`);
  },

  botEvents(api: ApiClient, conversationId: string, params: { cursor?: string; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<ListResult<BotEventItem>>(
      `/api/monitoring/conversations/${conversationId}/bot-events${suffix}`,
    );
  },

  episodes(api: ApiClient, conversationId: string) {
    return api.get<EpisodeItem[]>(`/api/monitoring/conversations/${conversationId}/episodes`);
  },

  botSession(api: ApiClient, conversationId: string) {
    return api.get<BotSessionSnapshot | null>(
      `/api/monitoring/conversations/${conversationId}/bot-session`,
    );
  },
};
