import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import {
  MonitoringService,
  isValidWindow,
  type BotEventItem,
  type BotSessionSnapshot,
  type EpisodeItem,
  type MonitoringOverview,
  type PathsOverview,
} from './monitoring.service';

const MAX_EVENTS_PAGE = 200;

/**
 * Monitoreo — sólo lectura. La lista de conversaciones y sus mensajes se sirven
 * desde `/api/inbox/*` (con `includeBotHandled=true`); acá vive únicamente lo
 * que el inbox no tiene: agregados y el recorrido técnico del bot.
 */
@Controller('monitoring')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('metrics/overview')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Analytics'))
  async overview(@Query('days') daysRaw?: string): Promise<MonitoringOverview> {
    const days = Number(daysRaw ?? 7);
    if (!isValidWindow(days)) throw new BadRequestException('days debe ser 7 o 30');
    return this.monitoring.getOverview(days);
  }

  @Get('metrics/paths')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Analytics'))
  async paths(@Query('days') daysRaw?: string): Promise<PathsOverview> {
    const days = Number(daysRaw ?? 7);
    if (!isValidWindow(days)) throw new BadRequestException('days debe ser 7 o 30');
    return this.monitoring.getPaths(days);
  }

  @Get('conversations/:id/bot-events')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  async botEvents(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ items: BotEventItem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(Number(limitRaw ?? 100) || 100, 1), MAX_EVENTS_PAGE);
    return this.monitoring.listBotEvents(id, cursor, limit);
  }

  @Get('conversations/:id/episodes')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  async episodes(@Param('id') id: string): Promise<EpisodeItem[]> {
    return this.monitoring.listEpisodes(id);
  }

  @Get('conversations/:id/bot-session')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  async botSession(@Param('id') id: string): Promise<BotSessionSnapshot | null> {
    return this.monitoring.getBotSession(id);
  }
}
