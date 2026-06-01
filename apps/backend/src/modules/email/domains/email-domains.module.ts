import { Module } from '@nestjs/common';
import { EmailDomainsController } from './email-domains.controller';
import { EmailDomainsService } from './email-domains.service';
import { EmailDomainsPollerService } from './email-domains-poller.service';
import { SesDomainsService } from './ses-domains.service';

@Module({
  controllers: [EmailDomainsController],
  providers: [EmailDomainsService, EmailDomainsPollerService, SesDomainsService],
  exports: [EmailDomainsService, SesDomainsService],
})
export class EmailDomainsModule {}
