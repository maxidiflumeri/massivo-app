import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { EventsModule } from '../events/events.module';
import { ChannelsWebhookController } from './channels-webhook.controller';
import { ConversationIngestService } from './conversation-ingest.service';
import { MessengerWebhookHandler } from './messenger-webhook.handler';

/**
 * Fase 1-2 (multi-canal) — Módulo del webhook genérico `/api/channels/:kind/:slug`
 * (`ChannelsWebhookController`) + la ingesta agnóstica de inbound.
 *
 * Los adapters (`WhatsAppAdapter`, `MessengerAdapter`), el `ChannelAdapterRegistry`
 * y el motor del bot (`BotEngineService`/`BotFeatureService`) se proveen y exportan
 * desde `WapiModule`; acá se importan vía `WapiModule` → sin ciclo. `EventsModule`
 * provee `EventsService` para los eventos del inbox.
 *
 * `ConversationIngestService` (agnóstico) + `MessengerWebhookHandler` viven acá: son
 * el camino inbound de Messenger (WhatsApp sigue por `WapiWebhookService.process`).
 */
@Module({
  imports: [WapiModule, EventsModule],
  controllers: [ChannelsWebhookController],
  providers: [ConversationIngestService, MessengerWebhookHandler],
  // Exportado para el simulador dev (DevModule), que ingiere inbounds Messenger
  // sin pasar por HMAC/slug.
  exports: [ConversationIngestService],
})
export class ChannelsModule {}
