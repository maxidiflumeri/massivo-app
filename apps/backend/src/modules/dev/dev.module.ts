import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { ChannelsModule } from '../channels/channels.module';
import {
  DevSimulatorController,
  DevSimulatorEnabledGuard,
} from './dev-simulator.controller';
import { DevSimulatorService } from './dev-simulator.service';
import { MessengerSimulatorController } from './messenger-simulator.controller';
import { MessengerSimulatorService } from './messenger-simulator.service';
import { InstagramSimulatorController } from './instagram-simulator.controller';
import { InstagramSimulatorService } from './instagram-simulator.service';

/**
 * Módulo de utilidades de desarrollo (4.L). Sólo expone endpoints si
 * `ENABLE_DEV_SIMULATOR=true` (ver `DevSimulatorEnabledGuard`). El módulo se
 * registra siempre, así no hay branching en `app.module.ts`; el gate vive en
 * el guard. Importa `ChannelsModule` para reusar `ConversationIngestService` en los
 * simuladores de Messenger/Instagram.
 */
@Module({
  imports: [WapiModule, ChannelsModule],
  controllers: [DevSimulatorController, MessengerSimulatorController, InstagramSimulatorController],
  providers: [
    DevSimulatorService,
    DevSimulatorEnabledGuard,
    MessengerSimulatorService,
    InstagramSimulatorService,
  ],
})
export class DevModule {}
