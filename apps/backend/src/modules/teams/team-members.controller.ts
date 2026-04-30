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
import { TeamMembersService } from './team-members.service';
import { AddTeamMemberDto, UpdateTeamMemberRoleDto } from './team-members.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('teams/:teamId/members')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TeamMembersController {
  constructor(private readonly teamMembersService: TeamMembersService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Member'))
  findAll(@Param('teamId') teamId: string) {
    return this.teamMembersService.findAll(teamId);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('manage', 'Member'))
  addMember(@Param('teamId') teamId: string, @Body() dto: AddTeamMemberDto) {
    return this.teamMembersService.addMember(teamId, dto);
  }

  @Patch(':userId')
  @CheckPolicies((ability: AppAbility) => ability.can('manage', 'Member'))
  updateRole(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTeamMemberRoleDto,
  ) {
    return this.teamMembersService.updateRole(teamId, userId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('manage', 'Member'))
  removeMember(@Param('teamId') teamId: string, @Param('userId') userId: string) {
    return this.teamMembersService.removeMember(teamId, userId);
  }
}
