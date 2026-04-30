import { Module } from '@nestjs/common';
import { SmtpAccountsController } from './smtp-accounts.controller';
import { SmtpAccountsService } from './smtp-accounts.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  controllers: [SmtpAccountsController, EmailTemplatesController],
  providers: [SmtpAccountsService, EmailTemplatesService],
})
export class EmailModule {}
