import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { Audit } from '../../../common/audit/audit.decorator';
import { EmailDomainsService } from './email-domains.service';
import { CreateEmailDomainDto } from './email-domains.dto';
import type {
  CreateEmailDomainResponse,
  EmailDomainDetail,
  EmailDomainSummary,
} from '@massivo/shared-types';

@Controller('email/domains')
@UseGuards(ClerkAuthGuard, TenantContextGuard)
@UseInterceptors(TenantContextInterceptor)
export class EmailDomainsController {
  constructor(private readonly service: EmailDomainsService) {}

  @Get()
  list(): Promise<EmailDomainSummary[]> {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<EmailDomainDetail> {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'email.domain.created', resourceType: 'EmailDomain', resourceIdFrom: 'response:id' })
  create(@Body() dto: CreateEmailDomainDto): Promise<CreateEmailDomainResponse> {
    return this.service.create(dto);
  }

  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Param('id') id: string): Promise<EmailDomainDetail> {
    return this.service.refresh(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'email.domain.deleted', resourceType: 'EmailDomain', resourceIdFrom: 'param:id' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
