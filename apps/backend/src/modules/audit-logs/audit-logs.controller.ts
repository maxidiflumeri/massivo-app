import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import type { AppAbility } from '@massivo/permissions';
import { AuditLogsService, type AuditLogPage } from './audit-logs.service';
import { ListAuditLogsQueryDto } from './audit-logs.dto';

@Controller('audit-logs')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'AuditLog'))
  async list(@Query() query: ListAuditLogsQueryDto): Promise<AuditLogPage> {
    return this.service.list({
      cursor: query.cursor,
      limit: query.limit,
      actorUserId: query.actorUserId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      from: query.from,
      to: query.to,
    });
  }
}
