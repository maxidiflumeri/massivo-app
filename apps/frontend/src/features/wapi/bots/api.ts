import type { ApiClient } from '../../../api/client';
import type {
  BotConfigSnapshot,
  BotListItem,
  BotMediaUploadResult,
  BotSnapshot,
  ConnectedChannel,
  SandboxStepRequest,
  SandboxStepResponse,
  SaveBotDraftPayload,
  UpdateBotPayload,
} from './types';

/**
 * API config-scoped del bot (Phase 0a). El bot se resuelve vía el `configId`.
 * Sigue funcionando contra los endpoints `/wapi/configs/:id/bot/*` (que el
 * backend mantiene como compat, delegando a la entidad `Bot`). El editor actual
 * todavía usa esta API; se migrará a `botsApi` (bot-centric) en la UI 0b.
 */
export const botApi = {
  get(api: ApiClient, configId: string) {
    return api.get<BotConfigSnapshot>(`/api/wapi/configs/${configId}/bot`);
  },
  update(api: ApiClient, configId: string, payload: UpdateBotPayload) {
    return api.patch<BotConfigSnapshot>(`/api/wapi/configs/${configId}/bot`, payload);
  },
  uploadMedia(api: ApiClient, configId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<BotMediaUploadResult>(`/api/wapi/configs/${configId}/bot/media`, form);
  },
  saveDraft(api: ApiClient, configId: string, payload: SaveBotDraftPayload) {
    return api.patch<BotConfigSnapshot>(`/api/wapi/configs/${configId}/bot/draft`, payload);
  },
  publish(api: ApiClient, configId: string) {
    return api.post<BotConfigSnapshot>(`/api/wapi/configs/${configId}/bot/publish`, {});
  },
  discardDraft(api: ApiClient, configId: string) {
    return api.post<BotConfigSnapshot>(`/api/wapi/configs/${configId}/bot/discard-draft`, {});
  },
  sandboxStep(api: ApiClient, configId: string, payload: SandboxStepRequest) {
    return api.post<SandboxStepResponse>(`/api/wapi/configs/${configId}/bot/sandbox/step`, payload);
  },
};

/**
 * Phase 0b (multi-canal) — API bot-centric (`/api/bots`). El bot se diseña una
 * vez (por `botId`) y se conecta a N canales. El upload de media sigue siendo
 * config-scoped (`botApi.uploadMedia`) porque los mediaId de Meta son por-WABA.
 */
export const botsApi = {
  list(api: ApiClient) {
    return api.get<BotListItem[]>(`/api/bots`);
  },
  create(api: ApiClient, name: string) {
    return api.post<BotSnapshot>(`/api/bots`, { name });
  },
  get(api: ApiClient, botId: string) {
    return api.get<BotSnapshot>(`/api/bots/${botId}`);
  },
  update(api: ApiClient, botId: string, payload: UpdateBotPayload) {
    return api.patch<BotSnapshot>(`/api/bots/${botId}`, payload);
  },
  saveDraft(api: ApiClient, botId: string, payload: SaveBotDraftPayload) {
    return api.patch<BotSnapshot>(`/api/bots/${botId}/draft`, payload);
  },
  publish(api: ApiClient, botId: string) {
    return api.post<BotSnapshot>(`/api/bots/${botId}/publish`, {});
  },
  discardDraft(api: ApiClient, botId: string) {
    return api.post<BotSnapshot>(`/api/bots/${botId}/discard-draft`, {});
  },
  remove(api: ApiClient, botId: string) {
    return api.delete<void>(`/api/bots/${botId}`);
  },
  sandboxStep(api: ApiClient, botId: string, payload: SandboxStepRequest) {
    return api.post<SandboxStepResponse>(`/api/bots/${botId}/sandbox/step`, payload);
  },
  /** Conecta un canal (WapiConfig) a este bot. */
  connectChannel(api: ApiClient, botId: string, configId: string) {
    return api.post<ConnectedChannel>(`/api/bots/${botId}/channels/${configId}`, {});
  },
  /** Desconecta un canal de este bot. */
  disconnectChannel(api: ApiClient, botId: string, configId: string) {
    return api.delete<ConnectedChannel>(`/api/bots/${botId}/channels/${configId}`);
  },
};
