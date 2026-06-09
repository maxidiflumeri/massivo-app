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
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ChannelsService } from './channels.service';
import { AssignAutomationDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('channels')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  findAll(@Query('kind') kind?: string) {
    return this.service.findAll(kind);
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * 4.P — revela secretos en claro (verifyToken). Sólo OWNER/ADMIN de org.
   * El usuario lo necesita al pegar el webhook en la consola de Meta.
   */
  @Get(':id/reveal-secrets')
  @CheckPolicies((ability: AppAbility) => ability.can('manage', 'Organization'))
  @Audit({ action: 'wapi.config.secretsRevealed', resourceType: 'WapiConfig', resourceIdFrom: 'param:id' })
  revealSecrets(@Param('id') id: string) {
    return this.service.revealSecrets(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiConfig'))
  @Audit({ action: 'wapi.config.created', resourceType: 'WapiConfig', resourceIdFrom: 'response:id' })
  create(@Body() dto: CreateChannelDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'wapi.config.updated', resourceType: 'WapiConfig', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.service.update(id, dto);
  }

  /**
   * Asigna la automatización del canal: bot XOR agente (o ninguno). Centraliza la
   * asignación que antes estaba repartida entre Canales (bot) y Agentes (agente).
   */
  @Patch(':id/automation')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'wapi.config.automationAssigned', resourceType: 'WapiConfig', resourceIdFrom: 'param:id' })
  assignAutomation(@Param('id') id: string, @Body() dto: AssignAutomationDto) {
    return this.service.assignAutomation(id, dto.type, dto.refId ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'WapiConfig'))
  @Audit({ action: 'wapi.config.deleted', resourceType: 'WapiConfig', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
