import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { Audit } from '../../../common/audit/audit.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AppAbility } from '@massivo/permissions';
import { SuppressionService } from './suppression.service';
import { CreateUnsubscribeDto } from './suppressions.dto';

interface UnsubscribeRow {
  id: string;
  email: string;
  scope: string;
  campaignId: string | null;
  reason: string | null;
  source: string | null;
  createdAt: Date;
}

interface BounceRow {
  id: string;
  email: string | null;
  code: string | null;
  description: string | null;
  occurredAt: Date;
}

interface ListResponse<T> {
  items: T[];
  nextCursor: string | null;
}

@Controller('email/suppressions')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SuppressionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppression: SuppressionService,
  ) {}

  /**
   * Lista paginada de unsubscribes. Cursor-based: take=limit+1 trick.
   * Filtro opcional por email (substring, case-insensitive).
   */
  @Get('unsubscribes')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'EmailSuppression'))
  async listUnsubscribes(
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('email') email?: string,
  ): Promise<ListResponse<UnsubscribeRow>> {
    const limit = clampLimit(limitRaw);
    const rows = await this.prisma.scoped.emailUnsubscribe.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...(email ? { where: { email: { contains: email.trim(), mode: 'insensitive' } } } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        scope: true,
        campaignId: true,
        reason: true,
        source: true,
        createdAt: true,
      },
    });
    return takePage(rows, limit);
  }

  @Get('bounces')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'EmailSuppression'))
  async listBounces(
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('email') email?: string,
  ): Promise<ListResponse<BounceRow>> {
    const limit = clampLimit(limitRaw);
    const rows = await this.prisma.scoped.emailBounce.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...(email ? { where: { email: { contains: email.trim(), mode: 'insensitive' } } } : {}),
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        email: true,
        code: true,
        description: true,
        occurredAt: true,
      },
    });
    return takePage(rows, limit);
  }

  @Post('unsubscribes')
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'EmailSuppression'))
  @Audit({ action: 'email.suppression.unsubscribeAdded', resourceType: 'EmailUnsubscribe' })
  async createUnsubscribe(@Body() dto: CreateUnsubscribeDto): Promise<{ ok: true }> {
    await this.suppression.addUnsubscribe({
      email: dto.email,
      scope: dto.scope,
      campaignId: dto.campaignId ?? null,
      reason: dto.reason,
      source: 'manual',
    });
    return { ok: true };
  }

  @Delete('unsubscribes/:id')
  @HttpCode(204)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'EmailSuppression'))
  @Audit({ action: 'email.suppression.unsubscribeRemoved', resourceType: 'EmailUnsubscribe', resourceIdFrom: 'param:id' })
  async deleteUnsubscribe(@Param('id') id: string): Promise<void> {
    const ok = await this.suppression.deleteUnsubscribe(id);
    if (!ok) throw new NotFoundException(`EmailUnsubscribe ${id} not found`);
  }

  @Delete('bounces/:id')
  @HttpCode(204)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'EmailSuppression'))
  @Audit({ action: 'email.suppression.bounceRemoved', resourceType: 'EmailBounce', resourceIdFrom: 'param:id' })
  async deleteBounce(@Param('id') id: string): Promise<void> {
    const ok = await this.suppression.deleteBounce(id);
    if (!ok) throw new NotFoundException(`EmailBounce ${id} not found`);
  }
}

function clampLimit(raw?: string): number {
  const n = Number(raw) || 50;
  return Math.min(Math.max(n, 1), 200);
}

function takePage<T extends { id: string }>(rows: T[], limit: number): ListResponse<T> {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, nextCursor: items[items.length - 1]!.id };
  }
  return { items: rows, nextCursor: null };
}
