import type { ApiClient } from '../../../api/client';
import type { LiveSnapshot } from './types';

export const liveApi = {
  snapshot(api: ApiClient) {
    return api.get<LiveSnapshot>('/api/wapi/live/snapshot');
  },
};
