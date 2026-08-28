import { Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import {
  MonitoringService,
  type BotEventItem,
  type BotSessionSnapshot,
  type EpisodeItem,
  type MonitoringOverview,
  type PathsOverview,
} from './monitoring.service';
import { MonitoringReportService, type MonitoringReport } from './monitoring-report.service';
import { parseRange } from './monitoring-range';

const MAX_EVENTS_PAGE = 200;

/**
 * Ventana de las métricas. Se acepta `from`/`to` (YYYY-MM-DD locales, ambos
 * inclusive) o el atajo `days`; ver `parseRange`.
 */
interface RangeQuery {
  from?: string;
  to?: string;
  days?: string;
}

/**
 * Monitoreo — sólo lectura. La lista de conversaciones y sus mensajes se sirven
 * desde `/api/inbox/*` (con `includeBotHandled=true`); acá vive únicamente lo
 * que el inbox no tiene: agregados y el recorrido técnico del bot.
 */
@Controller('monitoring')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly report: MonitoringReportService,
  ) {}

  @Get('metrics/overview')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Analytics'))
  async overview(@Query() q: RangeQuery): Promise<MonitoringOverview> {
    return this.monitoring.getOverview(parseRange(q));
  }

  @Get('metrics/paths')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Analytics'))
  async paths(@Query() q: RangeQuery): Promise<PathsOverview> {
    return this.monitoring.getPaths(parseRange(q));
  }

  /**
   * Paquete de datos del informe descargable. Devuelve JSON: el PDF lo arma el
   * navegador, así que el servidor no necesita un motor de render.
   *
   * Es la consulta más cara del módulo —cruza `BotEvent` con las visitas de
   * `Message`—, del orden de segundos sobre ventanas largas. Se pide a demanda,
   * no en cada carga del tablero.
   */
  @Get('metrics/report')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Analytics'))
  async reportData(@Query() q: RangeQuery): Promise<MonitoringReport> {
    return this.report.build(parseRange(q));
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
