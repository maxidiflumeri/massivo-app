import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { EventsModule } from '../events/events.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ChannelsWebhookController } from './channels-webhook.controller';
import { ConversationIngestService } from './conversation-ingest.service';
import { MessengerWebhookHandler } from './messenger-webhook.handler';
import { InstagramWebhookHandler } from './instagram-webhook.handler';

/**
 * Fase 1-2 (multi-canal) — Módulo del webhook genérico `/api/channels/:kind/:slug`
 * (`ChannelsWebhookController`) + la ingesta agnóstica de inbound.
 *
 * Los adapters (`WhatsAppAdapter`, `MessengerAdapter`), el `ChannelAdapterRegistry`
 * y el motor del bot (`BotEngineService`/`BotFeatureService`) se proveen y exportan
 * desde `WapiModule`; acá se importan vía `WapiModule` → sin ciclo. `EventsModule`
 * provee `EventsService` para los eventos del inbox.
 *
 * `ConversationIngestService` (agnóstico) + los handlers de Meta Messaging
 * (`MessengerWebhookHandler`, `InstagramWebhookHandler`) viven acá: son el camino
 * inbound de Messenger/Instagram (WhatsApp sigue por `WapiWebhookService.process`).
 */
@Module({
  imports: [WapiModule, EventsModule],
  // OJO orden: el admin (`ChannelsController`, rutas /channels, /channels/:id,
  // /channels/:id/reveal-secrets) va ANTES del webhook (`/channels/:kind/:slug`)
  // para que `/channels/:id/reveal-secrets` (2 segmentos) no lo capture la ruta
  // param del webhook. El webhook igual 404ea si el kind no existe, así que el
  // peor caso de un mis-match sería un 404 limpio, no un leak.
  controllers: [ChannelsController, ChannelsWebhookController],
  providers: [ChannelsService, ConversationIngestService, MessengerWebhookHandler, InstagramWebhookHandler],
  // Exportado para el simulador dev (DevModule), que ingiere inbounds Messenger
  // sin pasar por HMAC/slug.
  exports: [ConversationIngestService],
})
export class ChannelsModule {}
