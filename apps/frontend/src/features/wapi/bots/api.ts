import type { ApiClient } from '../../../api/client';
import type {
  BotConfigSnapshot,
  BotMediaUploadResult,
  SandboxStepRequest,
  SandboxStepResponse,
  SaveBotDraftPayload,
  UpdateBotPayload,
} from './types';

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
