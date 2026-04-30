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

@Module({
  controllers: [
    SmtpAccountsController,
    EmailTemplatesController,
    TrackController,
    UnsubscribeController,
    SuppressionsController,
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
  ],
  exports: [EmailQueueService, EmailSenderService, TrackingTokenService, SuppressionService],
})
export class EmailModule {}
