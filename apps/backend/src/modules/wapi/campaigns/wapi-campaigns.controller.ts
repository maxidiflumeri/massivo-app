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
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiCampaignsService } from './wapi-campaigns.service';
import {
  AddWapiCampaignContactsDto,
  CreateWapiCampaignDto,
  UpdateWapiCampaignDto,
} from './wapi-campaigns.dto';

@Controller('wapi/campaigns')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiCampaignsController {
  constructor(private readonly service: WapiCampaignsService) {}

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

  @Post()
  @CheckPolicies((a: AppAbility) => a.can('create', 'Campaign'))
  create(@Body() dto: CreateWapiCampaignDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Campaign'))
  update(@Param('id') id: string, @Body() dto: UpdateWapiCampaignDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Post(':id/contacts')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Campaign'))
  addContacts(@Param('id') id: string, @Body() dto: AddWapiCampaignContactsDto) {
    return this.service.addContacts(id, dto);
  }

  @Get(':id/contacts/data-keys')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  getContactDataKeys(@Param('id') id: string): Promise<string[]> {
    return this.service.getContactDataKeys(id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  send(@Param('id') id: string): Promise<{ enqueued: number }> {
    return this.service.send(id);
  }

  @Post(':id/pause')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  pause(@Param('id') id: string): Promise<unknown> {
    return this.service.pause(id);
  }

  @Post(':id/resume')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  resume(@Param('id') id: string): Promise<{ resumed: true; reEnqueued: number }> {
    return this.service.resume(id);
  }

  @Post(':id/force-close')
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  forceClose(@Param('id') id: string): Promise<{ closed: true; canceled: number }> {
    return this.service.forceClose(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((a: AppAbility) => a.can('delete', 'Campaign'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
