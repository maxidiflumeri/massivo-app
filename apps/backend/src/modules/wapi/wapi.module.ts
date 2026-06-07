import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { EventsModule } from '../events/events.module';
import { WapiTemplatesController } from './wapi-templates.controller';
import { WapiTemplatesService } from './wapi-templates.service';
import { WapiCampaignsController } from './campaigns/wapi-campaigns.controller';
import { WapiCampaignsService } from './campaigns/wapi-campaigns.service';
import { WapiCampaignSchedulerService } from './campaigns/wapi-campaign-scheduler.service';
import { WapiSenderService } from './sender/wapi-sender.service';
import { WapiQueueService } from './queue/wapi-queue.service';
import { WapiWorkerService } from './queue/wapi-worker.service';
import { WapiTemplatesSyncService } from './templates-sync/wapi-templates-sync.service';
import { WapiTemplatesPostingService } from './templates-posting/wapi-templates-posting.service';
import { WapiWebhookController } from './webhook/wapi-webhook.controller';
import { WapiWebhookService } from './webhook/wapi-webhook.service';
import { WhatsAppWebhookHandler } from './webhook/whatsapp-webhook.handler';
import { WapiMediaService } from './media/wapi-media.service';
import { WapiQuickRepliesController } from './quick-replies/wapi-quick-replies.controller';
import { WapiQuickRepliesService } from './quick-replies/wapi-quick-replies.service';
import { WapiOptOutService } from './opt-out/wapi-opt-out.service';
import { WapiButtonActionService } from './button-actions/wapi-button-action.service';
import { BotEngineService } from '../bot/bot-engine.service';
import { BotService } from '../bot/bot.service';
import { BotController } from '../bot/bot.controller';
import { BotsController } from '../bot/bots.controller';
import {
  BotFeatureGuard,
  BotFeatureService,
} from '../bot/bot-feature.service';
import { BotRouterService } from '../bot/bot-router.service';
import { BotSandboxService } from '../bot/bot-sandbox.service';
import { BotWaitingExpirerService } from '../bot/bot-waiting-expirer.service';
import { BotHttpExecutor } from '../bot/bot-http-executor.service';
import { BotHttpRateLimiterService } from '../bot/bot-http-rate-limiter.service';
import { BotMediaFetchService } from '../bot/bot-media-fetch.service';
import { WapiLiveController } from './live/wapi-live.controller';
import { WapiLiveService } from './live/wapi-live.service';
// Fase 1b/2 — los adapters de canal y el registry viven acá (sus deps —
// WapiSenderService— están en este módulo) para que el motor del bot, el inbox y
// el webhook genérico los inyecten sin ciclo con ChannelsModule.
import { WhatsAppAdapter } from '../channels/adapters/whatsapp.adapter';
import { MessengerAdapter } from '../channels/adapters/messenger.adapter';
import { ChannelAdapterRegistry } from '../channels/channel-adapter.registry';

@Module({
  imports: [EventsModule, ContactsModule],
  controllers: [
    WapiTemplatesController,
    WapiCampaignsController,
    WapiWebhookController,
    WapiQuickRepliesController,
    BotController,
    BotsController,
    WapiLiveController,
  ],
  providers: [
    WapiTemplatesService,
    WapiCampaignsService,
    WapiCampaignSchedulerService,
    WapiSenderService,
    WapiQueueService,
    WapiWorkerService,
    WapiWebhookService,
    WhatsAppWebhookHandler,
    WapiTemplatesSyncService,
    WapiTemplatesPostingService,
    WapiMediaService,
    WapiQuickRepliesService,
    WapiOptOutService,
    WapiButtonActionService,
    BotEngineService,
    BotService,
    BotFeatureService,
    BotFeatureGuard,
    BotRouterService,
    BotSandboxService,
    BotWaitingExpirerService,
    BotHttpRateLimiterService,
    BotHttpExecutor,
    BotMediaFetchService,
    WapiLiveService,
    WhatsAppAdapter,
    MessengerAdapter,
    ChannelAdapterRegistry,
  ],
  exports: [
    WapiQueueService,
    WapiSenderService,
    WapiMediaService,
    WapiWebhookService,
    WhatsAppWebhookHandler,
    BotFeatureService,
    // Exportado para InboxModule (modules/inbox), que reusa el motor del bot.
    BotEngineService,
    WhatsAppAdapter,
    MessengerAdapter,
    // Registry de adapters: lo consumen el webhook genérico (ChannelsModule) y
    // el motor del bot / inbox para resolver el adapter por channelKind.
    ChannelAdapterRegistry,
  ],
})
export class WapiModule {}
