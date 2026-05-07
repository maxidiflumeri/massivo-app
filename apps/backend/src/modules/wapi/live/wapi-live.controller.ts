import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiLiveService } from './wapi-live.service';

@Controller('wapi/live')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiLiveController {
  constructor(private readonly service: WapiLiveService) {}

  @Get('snapshot')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Campaign'))
  snapshot() {
    return this.service.snapshot();
  }
}
