import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AppAbility } from '@massivo/permissions';

@Controller('email/suppressions')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SuppressionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'EmailSuppression'))
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('take') takeRaw?: string,
  ): Promise<{
    unsubscribes: Array<{ id: string; email: string; scope: string; campaignId: string | null; createdAt: Date }>;
    bounces: Array<{ id: string; email: string | null; code: string | null; occurredAt: Date }>;
  }> {
    const take = Math.min(Number(takeRaw) || 50, 200);

    const [unsubscribes, bounces] = await Promise.all([
      this.prisma.scoped.emailUnsubscribe.findMany({
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, scope: true, campaignId: true, createdAt: true },
      }),
      this.prisma.scoped.emailBounce.findMany({
        take,
        orderBy: { occurredAt: 'desc' },
        select: { id: true, email: true, code: true, occurredAt: true },
      }),
    ]);

    return { unsubscribes, bounces };
  }
}
