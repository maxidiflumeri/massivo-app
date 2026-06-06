import { Injectable } from '@nestjs/common';
import { MetaMessagingAdapter } from './meta-messaging.adapter';
import type { ChannelKind } from '../adapter.types';

/**
 * Fase 2 — Adapter de Facebook Messenger (Graph API `/me/messages`, webhook
 * `object: 'page'`). Hereda todo el comportamiento de `MetaMessagingAdapter`;
 * sólo fija el kind y el `object` del webhook. (Instagram, Fase 3, será otra
 * subclase con `object: 'instagram'`.)
 */
@Injectable()
export class MessengerAdapter extends MetaMessagingAdapter {
  readonly kind: ChannelKind = 'MESSENGER';
  protected readonly webhookObject = 'page';
}
