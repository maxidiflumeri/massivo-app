import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto } from './teams.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('teams')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Team'))
  findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Team'))
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Team'))
  @Audit({ action: 'team.created', resourceType: 'Team', resourceIdFrom: 'response:id' })
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Team'))
  @Audit({ action: 'team.updated', resourceType: 'Team', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Team'))
  @Audit({ action: 'team.deleted', resourceType: 'Team', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.teamsService.remove(id);
  }
}
