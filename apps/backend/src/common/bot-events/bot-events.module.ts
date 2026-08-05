import { Global, Module } from '@nestjs/common';
import { BotEventRecorder } from './bot-event-recorder.service';

/**
 * Monitoreo — provee `BotEventRecorder` globalmente, igual que `AuditLogModule`.
 * Global porque el engine del bot se instancia desde varios módulos (wapi,
 * channels) y no queremos replicar el provider en cada uno.
 */
@Global()
@Module({
  providers: [BotEventRecorder],
  exports: [BotEventRecorder],
})
export class BotEventsModule {}
