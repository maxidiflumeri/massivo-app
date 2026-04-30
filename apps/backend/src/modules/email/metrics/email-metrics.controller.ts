import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import type { AppAbility } from '@massivo/permissions';
import { EmailMetricsService, isValidWindow, type MetricsOverview } from './email-metrics.service';

@Controller('email/metrics')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class EmailMetricsController {
  constructor(private readonly metrics: EmailMetricsService) {}

  @Get('overview')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Analytics'))
  async overview(@Query('days') daysRaw?: string): Promise<MetricsOverview> {
    const days = Number(daysRaw ?? 7);
    if (!isValidWindow(days)) {
      throw new BadRequestException('days debe ser 7 o 30');
    }
    return this.metrics.getOverview(days);
  }
}
