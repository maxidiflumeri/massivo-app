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
import { WapiTemplatesSyncService } from './templates-sync/wapi-templates-sync.service';
import { WapiTemplatesPostingService } from './templates-posting/wapi-templates-posting.service';
import { WapiWebhookController } from './webhook/wapi-webhook.controller';
import { WapiWebhookService } from './webhook/wapi-webhook.service';
import { WapiInboxController } from './inbox/wapi-inbox.controller';
import { WapiInboxService } from './inbox/wapi-inbox.service';
import { WapiMediaService } from './media/wapi-media.service';
import { WapiQuickRepliesController } from './quick-replies/wapi-quick-replies.controller';
import { WapiQuickRepliesService } from './quick-replies/wapi-quick-replies.service';

@Module({
  imports: [EventsModule],
  controllers: [
    WapiConfigsController,
    WapiTemplatesController,
    WapiCampaignsController,
    WapiWebhookController,
    WapiInboxController,
    WapiQuickRepliesController,
  ],
  providers: [
    WapiConfigsService,
    WapiTemplatesService,
    WapiCampaignsService,
    WapiSenderService,
    WapiQueueService,
    WapiWorkerService,
    WapiWebhookService,
    WapiTemplatesSyncService,
    WapiTemplatesPostingService,
    WapiInboxService,
    WapiMediaService,
    WapiQuickRepliesService,
  ],
  exports: [WapiQueueService, WapiSenderService, WapiMediaService, WapiWebhookService],
})
export class WapiModule {}
