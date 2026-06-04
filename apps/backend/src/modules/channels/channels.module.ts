import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { ChannelAdapterRegistry } from './channel-adapter.registry';

/**
 * Fase 1 (multi-canal) — Módulo de abstracción de canal. Expone el
 * `ChannelAdapterRegistry` para que el motor del bot, el inbox y el webhook
 * envíen/reciban vía adapters normalizados en vez de acoplarse a un proveedor.
 *
 * Importa `WapiModule` para reusar `WapiSenderService` en el `WhatsAppAdapter`
 * (re-empaque, no duplicación). En 1b los consumidores (engine/inbox) pasan a
 * depender de este registro.
 */
@Module({
  imports: [WapiModule],
  providers: [WhatsAppAdapter, ChannelAdapterRegistry],
  exports: [ChannelAdapterRegistry, WhatsAppAdapter],
})
export class ChannelsModule {}
