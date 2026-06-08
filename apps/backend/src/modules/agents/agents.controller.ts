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
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { AgentsService } from './agents.service';
import { ConnectChannelDto, CreateAgentDto, UpdateAgentConfigDto } from './agents.dto';

/**
 * API de Agentes IA. Reusa los permisos CASL de `WapiConfig` (read/update), igual
 * criterio que el bot, para no proliferar subjects en el v0.
 */
@Controller('agents')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'WapiConfig'))
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.created', resourceType: 'Agent', includeBody: true })
  create(@Body() dto: CreateAgentDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'WapiConfig'))
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.updated', resourceType: 'Agent', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateAgentConfigDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.deleted', resourceType: 'Agent', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/connect')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.connected', resourceType: 'Agent', resourceIdFrom: 'param:id' })
  connect(@Param('id') id: string, @Body() dto: ConnectChannelDto) {
    return this.service.connectChannel(id, dto.channelId);
  }

  @Post(':id/disconnect')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.disconnected', resourceType: 'Agent', resourceIdFrom: 'param:id' })
  disconnect(@Param('id') id: string, @Body() dto: ConnectChannelDto) {
    return this.service.disconnectChannel(id, dto.channelId);
  }
}
