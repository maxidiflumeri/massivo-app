import { Global, Module } from '@nestjs/common';
import { EventLogger } from './event-logger.service';

/**
 * 4.R — Provee `EventLogger` globalmente. La middleware
 * `ObservabilityMiddleware` se monta en AppModule.configure para abrir el
 * scope con traceId al inicio de cada HTTP request.
 */
@Global()
@Module({
  providers: [EventLogger],
  exports: [EventLogger],
})
export class ObservabilityModule {}
