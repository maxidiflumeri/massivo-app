import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { EmailCampaignsService } from './email-campaigns.service';
import {
  AddCampaignContactsDto,
  CreateEmailCampaignDto,
  UpdateEmailCampaignDto,
} from './email-campaigns.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('email/campaigns')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class EmailCampaignsController {
  constructor(private readonly service: EmailCampaignsService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  findOne(@Param('id') id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Get(':id/report')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  getReport(@Param('id') id: string) {
    return this.service.getReport(id);
  }

  @Post()
  @CheckPolicies((a: AppAbility) => a.can('create', 'Campaign'))
  create(@Body() dto: CreateEmailCampaignDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Campaign'))
  update(@Param('id') id: string, @Body() dto: UpdateEmailCampaignDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Post(':id/contacts')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Campaign'))
  addContacts(@Param('id') id: string, @Body() dto: AddCampaignContactsDto) {
    return this.service.addContacts(id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  send(@Param('id') id: string) {
    return this.service.send(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((a: AppAbility) => a.can('delete', 'Campaign'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
