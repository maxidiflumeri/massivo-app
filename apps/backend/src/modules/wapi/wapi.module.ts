import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { WapiConfigsController } from './wapi-configs.controller';
import { WapiConfigsService } from './wapi-configs.service';
import { WapiTemplatesController } from './wapi-templates.controller';
import { WapiTemplatesService } from './wapi-templates.service';
import { WapiCampaignsController } from './campaigns/wapi-campaigns.controller';
import { WapiCampaignsService } from './campaigns/wapi-campaigns.service';
import { WapiSenderService } from './sender/wapi-sender.service';
import { WapiQueueService } from './queue/wapi-queue.service';
import { WapiWorkerService } from './queue/wapi-worker.service';

@Module({
  imports: [EventsModule],
  controllers: [WapiConfigsController, WapiTemplatesController, WapiCampaignsController],
  providers: [
    WapiConfigsService,
    WapiTemplatesService,
    WapiCampaignsService,
    WapiSenderService,
    WapiQueueService,
    WapiWorkerService,
  ],
  exports: [WapiQueueService, WapiSenderService],
})
export class WapiModule {}
