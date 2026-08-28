import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { BotEventRetentionService } from './bot-event-retention.service';
import { MonitoringReportService } from './monitoring-report.service';

/**
 * Monitoreo — sección de observabilidad del panel: agregados diarios y
 * recorrido del bot por conversación. El registro de eventos vive aparte
 * (`common/bot-events`, global) porque lo escribe el engine.
 */
@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringReportService, BotEventRetentionService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
