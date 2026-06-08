import type { ChannelKind } from '../inbox/types';

export type NotificationType = 'NEW_MESSAGE' | 'ASSIGNED' | 'UNASSIGNED_NEW' | 'HANDOFF';
export type NotificationBucket = 'mine' | 'unassigned';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  bucket: NotificationBucket;
  conversationId: string;
  channelId: string;
  channelKind: ChannelKind;
  title: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResult {
  mine: NotificationItem[];
  unassigned: NotificationItem[];
  mineUnread: number;
  unassignedUnread: number;
}

/** Payload de `notification.read` (socket): borra por id, o por conversación
 *  (opcionalmente acotado a un balde). */
export interface NotificationReadEvent {
  id?: string;
  conversationId?: string;
  bucket?: NotificationBucket;
}

export interface NotificationReadAllEvent {
  bucket: NotificationBucket;
}
