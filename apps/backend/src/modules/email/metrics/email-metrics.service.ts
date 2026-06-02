import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

const VALID_WINDOWS = [7, 30] as const;
export type MetricsWindow = (typeof VALID_WINDOWS)[number];

export interface MetricsOverview {
  windowDays: MetricsWindow;
  from: string;
  to: string;
  totals: {
    sent: number;
    failed: number;
    bounced: number;
    complained: number;
    suppressed: number;
    pending: number;
  };
  uniqueOpens: number;
  uniqueClicks: number;
  rates: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  topCampaigns: Array<{
    id: string;
    name: string;
    sent: number;
    uniqueOpens: number;
    uniqueClicks: number;
    openRate: number;
    clickRate: number;
  }>;
}

/**
 * Cálculo de métricas globales agregadas por team. Asume estar dentro de
 * TenantContext.run — todas las queries usan prisma.scoped.
 *
 * Definiciones:
 *  - sent: reports SENT cuyo sentAt cae en la ventana.
 *  - uniqueOpens: reports cuyo firstOpenedAt cae en la ventana (un open único
 *    por destinatario, no cada vez que abre). Misma lógica para clicks.
 *  - openRate = uniqueOpens / sent (0 si no hay sent).
 *  - bounceRate = bounced / (sent + bounced) — denominador es "intentos
 *    entregados al servidor del destinatario", no incluye SUPPRESSED ni FAILED.
 */
@Injectable()
export class EmailMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(days: MetricsWindow): Promise<MetricsOverview> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.scoped.emailReport.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    });

    const totals = {
      sent: 0,
      failed: 0,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      pending: 0,
    };
    for (const g of grouped) {
      const c = g._count._all;
      switch (g.status) {
        case 'SENT': totals.sent = c; break;
        case 'FAILED': totals.failed = c; break;
        case 'BOUNCED': totals.bounced = c; break;
        case 'COMPLAINED': totals.complained = c; break;
        case 'SUPPRESSED': totals.suppressed = c; break;
        case 'PENDING': totals.pending = c; break;
      }
    }

    const [uniqueOpens, uniqueClicks] = await Promise.all([
      this.prisma.scoped.emailReport.count({
        where: { firstOpenedAt: { gte: from } },
      }),
      this.prisma.scoped.emailReport.count({
        where: { firstClickedAt: { gte: from } },
      }),
    ]);

    const rates = {
      openRate: rate(uniqueOpens, totals.sent),
      clickRate: rate(uniqueClicks, totals.sent),
      bounceRate: rate(totals.bounced, totals.sent + totals.bounced),
      complaintRate: rate(totals.complained, totals.sent),
    };

    const topCampaigns = await this.computeTopCampaigns(from);

    return {
      windowDays: days,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      uniqueOpens,
      uniqueClicks,
      rates,
      topCampaigns,
    };
  }

  private async computeTopCampaigns(from: Date): Promise<MetricsOverview['topCampaigns']> {
    // Top campañas: filtramos campaignId NOT NULL para excluir reports
    // transaccionales (que no pertenecen a una campaña).
    const top = await this.prisma.scoped.emailReport.groupBy({
      by: ['campaignId'],
      where: { status: 'SENT', sentAt: { gte: from }, campaignId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { campaignId: 'desc' } },
      take: 5,
    });
    if (top.length === 0) return [];

    const ids = top
      .map((t) => t.campaignId)
      .filter((id): id is string => id !== null);
    const campaigns = await this.prisma.scoped.emailCampaign.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));

    const opensByCampaign = await this.prisma.scoped.emailReport.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids }, firstOpenedAt: { gte: from } },
      _count: { _all: true },
    });
    const clicksByCampaign = await this.prisma.scoped.emailReport.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids }, firstClickedAt: { gte: from } },
      _count: { _all: true },
    });
    const opensMap = new Map(
      opensByCampaign.map((g) => [g.campaignId, g._count?._all ?? 0]),
    );
    const clicksMap = new Map(
      clicksByCampaign.map((g) => [g.campaignId, g._count?._all ?? 0]),
    );

    return top
      .filter((t): t is typeof t & { campaignId: string } => t.campaignId !== null)
      .map((t) => {
        const sent = t._count?._all ?? 0;
        const opens = opensMap.get(t.campaignId) ?? 0;
        const clicks = clicksMap.get(t.campaignId) ?? 0;
        return {
          id: t.campaignId,
          name: nameById.get(t.campaignId) ?? '(sin nombre)',
          sent,
          uniqueOpens: opens,
          uniqueClicks: clicks,
          openRate: rate(opens, sent),
          clickRate: rate(clicks, sent),
        };
      });
  }
}

function rate(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 10000) / 10000;
}

export function isValidWindow(days: number): days is MetricsWindow {
  return (VALID_WINDOWS as readonly number[]).includes(days);
}
