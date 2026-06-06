import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { WapiModule } from '../wapi/wapi.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

/**
 * Fase 1e — Inbox omnicanal, sacado de `modules/wapi/`. Es channel-agnostic:
 * opera sobre los modelos unificados `Conversation`/`Message`/`Channel`.
 *
 * Importa `WapiModule` para reusar el envío (`WhatsAppAdapter`), la subida de
 * media (`WapiMediaService`) y el motor del bot (`BotEngineService`) — todos
 * exportados desde ahí. La dependencia es de una sola vía (InboxModule →
 * WapiModule): nada en WapiModule consume el inbox, así que no hay ciclo.
 */
@Module({
  imports: [WapiModule, EventsModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
