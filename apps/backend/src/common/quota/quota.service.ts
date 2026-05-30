import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type QuotaMetric = 'EMAIL' | 'WAPI';

export interface QuotaSnapshot {
  /** Plan code, ej "FREE". */
  planCode: string;
  /** ISO. Inicio del mes UTC. */
  periodStart: Date;
  /** ISO. Inicio del próximo mes UTC. */
  periodEnd: Date;
  /** Consumo del mes actual. */
  used: number;
  /** Límite del plan. `null` = ilimitado. */
  limit: number | null;
  /** `limit - used`, clamp a 0. `null` si ilimitado. */
  remaining: number | null;
}

/**
 * Lectura y enforcement de quotas mensuales del plan.
 *
 * Para `EMAIL`/`WAPI` cuenta los `*Report` con `sentAt` dentro del mes UTC
 * actual. **No** persiste en `UsageCounter` — se cuenta on-the-fly. Cuando
 * el volumen crezca conviene materializar contadores y/o cachear, pero
 * para el POC con ~miles de registros mensuales este `count()` indexado
 * por `(organizationId, sentAt)` rinde fino.
 *
 * `limit: null` significa ilimitado (planes que setean `-1` en `Plan.limits`).
 */
@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(
    organizationId: string,
    metric: QuotaMetric,
  ): Promise<QuotaSnapshot> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { plan: true },
    });

    const limits = (org.plan.limits ?? {}) as Record<string, unknown>;
    const rawLimit =
      metric === 'EMAIL' ? limits.emailsPerMonth : limits.wapiMessagesPerMonth;
    const limit = normalizeLimit(rawLimit);

    const periodStart = startOfMonthUtc(new Date());
    const periodEnd = startOfNextMonthUtc(new Date());

    const used =
      metric === 'EMAIL'
        ? await this.prisma.emailReport.count({
            where: {
              organizationId,
              sentAt: { gte: periodStart, lt: periodEnd },
            },
          })
        : await this.prisma.wapiReport.count({
            where: {
              organizationId,
              sentAt: { gte: periodStart, lt: periodEnd },
            },
          });

    const remaining = limit === null ? null : Math.max(0, limit - used);

    return {
      planCode: org.plan.code,
      periodStart,
      periodEnd,
      used,
      limit,
      remaining,
    };
  }
}

/** -1 ó cualquier negativo → null (ilimitado). Otros → number. */
function normalizeLimit(raw: unknown): number | null {
  if (typeof raw !== 'number') return 0;
  if (raw < 0) return null;
  return raw;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
