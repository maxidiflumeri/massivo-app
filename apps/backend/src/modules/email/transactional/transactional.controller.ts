import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { TenantContext } from '../../../common/auth/tenant-context';
import { TransactionalService } from './transactional.service';
import {
  TransactionalSendDto,
  ListTransactionalReportsDto,
} from './transactional.dto';
import type { AppAbility } from '@massivo/permissions';

/**
 * Endpoint transaccional para mails one-shot. Dos caminos:
 *
 *  1. `POST /api/email/transactional` — autenticado con Clerk JWT. Para
 *     scripts internos y testing manual desde el panel. Sujeto a
 *     PoliciesGuard (`send Campaign`).
 *
 *  2. `POST /api/email/transactional/by-slug/:slug` — sin Clerk auth. El
 *     `slug` es el `Organization.webhookSlug` (24 chars base64url), opaco
 *     y rotable, mismo mecanismo que usan los webhooks de WhatsApp para
 *     identificar tenant sin JWT. Pensado para el HTTP node del bot que
 *     no puede generar JWTs de Clerk. La quota y el ownership se aplican
 *     igual que con auth Clerk.
 */
@Controller('email/transactional')
export class TransactionalController {
  constructor(
    private readonly service: TransactionalService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
  @UseInterceptors(TenantContextInterceptor)
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('send', 'Campaign'))
  @Audit({
    action: 'email.transactional.sent',
    resourceType: 'EmailReport',
    resourceIdFrom: 'response:reportId',
  })
  send(@Body() dto: TransactionalSendDto) {
    return this.service.send(dto);
  }

  /**
   * Lista paginada de reports transaccionales (EmailReport WHERE campaignId
   * IS NULL). Filtros: rango de fechas y status. Para la pantalla de
   * "Email → Transaccionales" del panel.
   */
  @Get('reports')
  @UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
  @UseInterceptors(TenantContextInterceptor)
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Campaign'))
  async listReports(@Query() q: ListTransactionalReportsDto) {
    return this.service.listReports(q);
  }

  /**
   * Detalle de un report transaccional con timeline de eventos.
   */
  @Get('reports/:id')
  @UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
  @UseInterceptors(TenantContextInterceptor)
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Campaign'))
  async getReport(@Param('id') id: string) {
    return this.service.getReportDetail(id);
  }

  /**
   * Métricas agregadas de transaccionales en una ventana temporal.
   */
  @Get('metrics')
  @UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
  @UseInterceptors(TenantContextInterceptor)
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Campaign'))
  async metrics(@Query('days') days?: string) {
    return this.service.getMetrics(days ? Number(days) : 30);
  }

  @Post('by-slug/:slug')
  @HttpCode(HttpStatus.OK)
  async sendBySlug(@Param('slug') slug: string, @Body() dto: TransactionalSendDto) {
    const org = await this.prisma.organization.findUnique({
      where: { webhookSlug: slug },
      include: {
        teams: { where: { isDefault: true }, select: { id: true }, take: 1 },
      },
    });
    if (!org) throw new NotFoundException('Slug inválido');

    // Sin Clerk → no hay userId real. Para el TenantContext usamos un
    // marker sintético que distingue calls slug-auth en audit/logs. El
    // team default es el destino lógico (los templates / smtp accounts
    // están scoped a team).
    const teamId = org.teams[0]?.id ?? '';
    if (!teamId) {
      throw new NotFoundException('Org sin team default');
    }
    return TenantContext.run(
      {
        organizationId: org.id,
        teamId,
        userId: 'bot-slug-auth',
        orgRole: 'OWNER',
        teamRole: 'ADMIN',
      },
      () => this.service.send(dto),
    );
  }
}
