import type { ApiClient } from '../../../api/client';
import type { BotConfigSnapshot, BotMediaUploadResult, UpdateBotPayload } from './types';

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
};
