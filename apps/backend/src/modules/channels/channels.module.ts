import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { ChannelAdapterRegistry } from './channel-adapter.registry';

/**
 * Fase 1 (multi-canal) — Módulo de abstracción de canal. Expone el
 * `ChannelAdapterRegistry` (resuelve adapter por kind) para webhook/multi-canal.
 *
 * El `WhatsAppAdapter` se provee en `WapiModule` (sólo depende de
 * `WapiSenderService`) y se importa desde acá; así el motor/inbox lo inyectan
 * directo sin ciclo de módulos. El registry lo consume vía el import.
 */
@Module({
  imports: [WapiModule],
  providers: [ChannelAdapterRegistry],
  exports: [ChannelAdapterRegistry],
})
export class ChannelsModule {}
