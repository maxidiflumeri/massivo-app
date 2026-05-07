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
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { WapiTemplatesService } from './wapi-templates.service';
import { WapiTemplatesSyncService } from './templates-sync/wapi-templates-sync.service';
import { WapiTemplatesPostingService } from './templates-posting/wapi-templates-posting.service';
import { CreateWapiTemplateMetaDto } from './templates-posting/wapi-templates-posting.dto';
import { CreateWapiTemplateDto, UpdateWapiTemplateDto } from './wapi-templates.dto';
import type { AppAbility } from '@massivo/permissions';
import type { WapiTemplate } from '@massivo/prisma';

@Controller('wapi/templates')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiTemplatesController {
  constructor(
    private readonly service: WapiTemplatesService,
    private readonly sync: WapiTemplatesSyncService,
    private readonly posting: WapiTemplatesPostingService,
  ) {}

  @Post('sync/:configId')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiTemplate'))
  @Audit({ action: 'wapi.template.syncedFromMeta', resourceType: 'WapiConfig', resourceIdFrom: 'param:configId' })
  syncFromMeta(@Param('configId') configId: string) {
    return this.sync.sync(configId);
  }

  @Post('submit/:configId')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiTemplate'))
  @Audit({ action: 'wapi.template.submittedToMeta', resourceType: 'WapiConfig', resourceIdFrom: 'param:configId' })
  submitToMeta(
    @Param('configId') configId: string,
    @Body() dto: CreateWapiTemplateMetaDto,
  ): Promise<WapiTemplate> {
    return this.posting.submit(configId, dto);
  }

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiTemplate'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiTemplate'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/data-keys')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiTemplate'))
  dataKeys(@Param('id') id: string): Promise<string[]> {
    return this.service.getContactDataKeys(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiTemplate'))
  @Audit({ action: 'wapi.template.created', resourceType: 'WapiTemplate', resourceIdFrom: 'response:id' })
  create(@Body() dto: CreateWapiTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiTemplate'))
  @Audit({ action: 'wapi.template.updated', resourceType: 'WapiTemplate', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateWapiTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'WapiTemplate'))
  @Audit({ action: 'wapi.template.deleted', resourceType: 'WapiTemplate', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
