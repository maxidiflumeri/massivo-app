import { Module } from '@nestjs/common';
import { SmtpAccountsController } from './smtp-accounts.controller';
import { SmtpAccountsService } from './smtp-accounts.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { EmailSenderService } from './sender/email-sender.service';
import { EmailQueueService } from './queue/email-queue.service';
import { EmailWorkerService } from './queue/email-worker.service';

@Module({
  controllers: [SmtpAccountsController, EmailTemplatesController],
  providers: [
    SmtpAccountsService,
    EmailTemplatesService,
    EmailSenderService,
    EmailQueueService,
    EmailWorkerService,
  ],
  exports: [EmailQueueService, EmailSenderService],
})
export class EmailModule {}
