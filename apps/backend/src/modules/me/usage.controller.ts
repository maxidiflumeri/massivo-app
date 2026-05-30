import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { UsageService } from './usage.service';
import type { MeUsageResponse } from '@massivo/shared-types';

@Controller('me/usage')
@UseGuards(ClerkAuthGuard, TenantContextGuard)
@UseInterceptors(TenantContextInterceptor)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  get(): Promise<MeUsageResponse> {
    return this.usage.getUsage();
  }
}
