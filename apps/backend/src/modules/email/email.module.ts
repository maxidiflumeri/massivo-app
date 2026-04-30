import { Module } from '@nestjs/common';
import { SmtpAccountsController } from './smtp-accounts.controller';
import { SmtpAccountsService } from './smtp-accounts.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { EmailSenderService } from './sender/email-sender.service';
import { EmailQueueService } from './queue/email-queue.service';
import { EmailWorkerService } from './queue/email-worker.service';
import { TrackController } from './tracking/track.controller';
import { TrackService } from './tracking/track.service';
import { TrackingTokenService } from './tracking/tracking-token.service';
import { SuppressionService } from './suppression/suppression.service';
import { UnsubscribeController } from './suppression/unsubscribe.controller';
import { SuppressionsController } from './suppression/suppressions.controller';
import { SesWebhookController } from './webhook/ses-webhook.controller';
import { SesWebhookService } from './webhook/ses-webhook.service';
import { SnsValidatorAdapter } from './webhook/sns-validator.adapter';
import { EmailCampaignsController } from './campaigns/email-campaigns.controller';
import { EmailCampaignsService } from './campaigns/email-campaigns.service';

@Module({
  controllers: [
    SmtpAccountsController,
    EmailTemplatesController,
    TrackController,
    UnsubscribeController,
    SuppressionsController,
    SesWebhookController,
    EmailCampaignsController,
  ],
  providers: [
    SmtpAccountsService,
    EmailTemplatesService,
    EmailSenderService,
    EmailQueueService,
    EmailWorkerService,
    TrackService,
    TrackingTokenService,
    SuppressionService,
    SesWebhookService,
    SnsValidatorAdapter,
    EmailCampaignsService,
  ],
  exports: [EmailQueueService, EmailSenderService, TrackingTokenService, SuppressionService],
})
export class EmailModule {}
