import type { ApiClient } from '../../api/client';
import type { NotificationBucket, NotificationListResult } from './types';

export const notificationsApi = {
  list(api: ApiClient) {
    return api.get<NotificationListResult>('/api/notifications');
  },

  markRead(api: ApiClient, id: string) {
    return api.post<{ ok: true }>(`/api/notifications/${id}/read`);
  },

  markAllRead(api: ApiClient, bucket: NotificationBucket | 'all' = 'all') {
    return api.post<{ ok: true }>('/api/notifications/read-all', { bucket });
  },
};
