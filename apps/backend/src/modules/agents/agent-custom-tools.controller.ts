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
import { AgentsFeatureGuard } from './agents-feature.guard';
import { AgentCustomToolsService } from './agent-custom-tools.service';
import { CreateAgentToolDto, UpdateAgentToolDto } from './agents.dto';

/**
 * CRUD de tools personalizadas del team (las "Herramientas" de la UI). Mismos
 * permisos CASL de `WapiConfig` que el resto de la plataforma agéntica.
 */
@Controller('agent-tools')
@UseGuards(ClerkAuthGuard, TenantContextGuard, AgentsFeatureGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class AgentCustomToolsController {
  constructor(private readonly service: AgentCustomToolsService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'WapiConfig'))
  list() {
    return this.service.list();
  }

  @Get(':id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'WapiConfig'))
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  // Sin includeBody: el body puede traer headers secretos en texto plano.
  @Audit({ action: 'agent.tool.created', resourceType: 'AgentCustomTool' })
  create(@Body() dto: CreateAgentToolDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.tool.updated', resourceType: 'AgentCustomTool', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateAgentToolDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.tool.deleted', resourceType: 'AgentCustomTool', resourceIdFrom: 'param:id' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
  }
}
