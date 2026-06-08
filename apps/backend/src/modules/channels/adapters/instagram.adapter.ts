import { Injectable } from '@nestjs/common';
import { MetaMessagingAdapter } from './meta-messaging.adapter';
import type { ChannelKind } from '../adapter.types';

/**
 * Fase 3 — Adapter de Instagram Direct (DMs). Comparte con Messenger la Graph API
 * `/me/messages` y el envelope de webhook `entry[].messaging[]`; la única diferencia
 * es `payload.object: 'instagram'` (Messenger usa 'page'). Hereda todo el
 * comportamiento de `MetaMessagingAdapter`; sólo fija el kind y el `object`.
 *
 * Identidad: el `entry[].id` del webhook IG es el id de la cuenta de Instagram
 * business; lo matcheamos contra `Channel.pageId` (reusamos esa columna como
 * "id externo de la cuenta Meta" — page id para Messenger, IG account id para IG).
 * El envío usa el access token de la página de Facebook vinculada (recipient = IGSID).
 */
@Injectable()
export class InstagramAdapter extends MetaMessagingAdapter {
  readonly kind: ChannelKind = 'INSTAGRAM';
  protected readonly webhookObject = 'instagram';
}
