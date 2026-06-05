import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { ChannelsWebhookController } from './channels-webhook.controller';

/**
 * Fase 1 (multi-canal) — Módulo de abstracción de canal. Expone el
 * `ChannelAdapterRegistry` (resuelve adapter por kind) y el webhook genérico
 * `/api/channels/:kind/:slug` (`ChannelsWebhookController`, 1c).
 *
 * El `WhatsAppAdapter` y el `WhatsAppWebhookHandler` se proveen en `WapiModule`
 * (dependen sólo de `WapiSenderService`/`WapiWebhookService`) y se importan desde
 * acá; así no hay ciclo de módulos: el registry y el controller los consumen vía
 * el import de `WapiModule`.
 */
@Module({
  imports: [WapiModule],
  controllers: [ChannelsWebhookController],
  providers: [ChannelAdapterRegistry],
  exports: [ChannelAdapterRegistry],
})
export class ChannelsModule {}
