import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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

/**
 * Placeholder controller para 4.A. CRUD completo (`GET`/`POST` raíz, `addContacts`,
 * `pause`/`resume`/`forceClose`, `getReport`) viene en 4.E.
 */
@Controller('wapi/campaigns')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiCampaignsController {
  constructor(private readonly service: WapiCampaignsService) {}

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Campaign'))
  send(@Param('id') id: string): Promise<{ enqueued: number }> {
    return this.service.send(id);
  }
}
