import type { ApiClient } from '../../api/client';
import type { ListResult } from '../inbox/types';
import type {
  BotEventItem,
  DayRange,
  EpisodeItem,
  BotSessionSnapshot,
  MonitoringOverview,
  MonitoringReport,
  PathsOverview,
} from './types';

/** `from`/`to` son días locales YYYY-MM-DD, ambos inclusive. */
function rangeQs(range: DayRange): string {
  return `from=${range.from}&to=${range.to}`;
}

/**
 * Monitoreo — sólo lo que el inbox no expone. La lista de conversaciones y sus
 * mensajes se piden con `inboxApi` (`includeBotHandled: true`), para no duplicar
 * endpoints ni lógica de permisos.
 */
export const monitoringApi = {
  overview(api: ApiClient, range: DayRange) {
    return api.get<MonitoringOverview>(`/api/monitoring/metrics/overview?${rangeQs(range)}`);
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

  paths(api: ApiClient, range: DayRange) {
    return api.get<PathsOverview>(`/api/monitoring/metrics/paths?${rangeQs(range)}`);
  },

  /**
   * Datos del informe descargable. Es la consulta más cara del módulo (cruza
   * los eventos del bot con las visitas): se pide sólo al apretar Descargar.
   */
  report(api: ApiClient, range: DayRange) {
    return api.get<MonitoringReport>(`/api/monitoring/metrics/report?${rangeQs(range)}`);
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
