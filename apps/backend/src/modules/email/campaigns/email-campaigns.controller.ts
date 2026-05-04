import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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

  @Get(':id/reports')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  listReports(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.service.listReports(id, { status, cursor, limit });
  }

  @Get(':id/reports/:reportId/events')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  listReportEvents(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
  ) {
    return this.service.listReportEvents(id, reportId);
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

  @Post(':id/pause')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }

  @Post(':id/resume')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  resume(@Param('id') id: string) {
    return this.service.resume(id);
  }

  @Post(':id/force-close')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  forceClose(@Param('id') id: string) {
    return this.service.forceClose(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((a: AppAbility) => a.can('delete', 'Campaign'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
