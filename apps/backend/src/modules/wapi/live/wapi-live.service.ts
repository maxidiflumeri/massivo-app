import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface LiveCampaignSummary {
  id: string;
  name: string;
  status: string;
  configId: string;
  configName: string | null;
  templateName: string | null;
  startedAt: Date | null;
  total: number;
  totals: {
    PENDING: number;
    SENT: number;
    DELIVERED: number;
    READ: number;
    FAILED: number;
    CANCELED: number;
  };
  throughputLast5min: number;
  /** 4.Q — throttle resuelto (campaign.config override o WapiConfig). En ms. */
  delayMinMs: number;
  delayMaxMs: number;
  delaySource: 'campaign' | 'config';
}

export interface LiveConfigUsage {
  id: string;
  name: string | null;
  phoneNumberId: string;
  dailyLimit: number;
  sentLast24h: number;
  percent: number;
  isTestMode: boolean;
  /** 4.Q — throttle base de la línea (sin overrides per-campaña). En ms. */
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
}

export interface LiveInboxSnapshot {
  unassigned: number;
  waiting: number;
  escalatedTotal: number;
  oldestUnassignedAt: Date | null;
}

export interface LiveSnapshot {
  campaigns: LiveCampaignSummary[];
  configs: LiveConfigUsage[];
  inbox: LiveInboxSnapshot;
  generatedAt: Date;
}

const ACTIVE_STATUSES = ['PROCESSING', 'PAUSED'] as const;
const ALL_STATUS_KEYS = [
  'PENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'CANCELED',
] as const;

@Injectable()
export class WapiLiveService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Snapshot agregado para el live dashboard. Devuelve campañas activas con
   * funnel + throughput, uso del daily limit por config (sentLast24h vs
   * `WapiConfig.dailyLimit`, mismo cómputo que el worker para evitar drift)
   * y resumen del inbox (sin asignar / en espera / escaladas + más antigua).
   *
   * No persiste estado ni emite — el frontend gatilla re-fetch ante eventos
   * `wapi.report.updated` / `wapi.report.log` / `conversation.updated`
   * que ya se emiten desde el worker, campañas e inbox.
   */
  async snapshot(): Promise<LiveSnapshot> {
    const now = new Date();
    const since5min = new Date(now.getTime() - 5 * 60_000);
    const since24h = new Date(now.getTime() - 24 * 60 * 60_000);

    const [campaigns, configs, inbox] = await Promise.all([
      this.collectCampaigns(since5min),
      this.collectConfigs(since24h),
      this.collectInbox(),
    ]);

    return { campaigns, configs, inbox, generatedAt: now };
  }

  private async collectCampaigns(since5min: Date): Promise<LiveCampaignSummary[]> {
    const rows = (await this.prisma.scoped.wapiCampaign.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      orderBy: [{ status: 'asc' }, { sentAt: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      select: {
        id: true,
        name: true,
        status: true,
        channelId: true,
        sentAt: true,
        config: true,
        channel: { select: { name: true, sendDelayMinMs: true, sendDelayMaxMs: true } },
        template: { select: { metaName: true } },
      },
    })) as Array<{
      id: string;
      name: string;
      status: string;
      channelId: string;
      sentAt: Date | null;
      config: unknown;
      channel: {
        name: string | null;
        sendDelayMinMs: number;
        sendDelayMaxMs: number;
      } | null;
      template: { metaName: string | null } | null;
    }>;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);

    const groupedRaw = await this.prisma.scoped.wapiReport.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    });
    const throughputsRaw = await this.prisma.scoped.wapiReport.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids }, sentAt: { gte: since5min } },
      _count: { _all: true },
    });
    const grouped = groupedRaw as Array<{
      campaignId: string;
      status: string;
      _count: { _all: number };
    }>;
    const throughputs = throughputsRaw as Array<{
      campaignId: string;
      _count: { _all: number };
    }>;

    const totalsByCampaign = new Map<
      string,
      Record<(typeof ALL_STATUS_KEYS)[number], number>
    >();
    for (const id of ids) {
      totalsByCampaign.set(id, {
        PENDING: 0,
        SENT: 0,
        DELIVERED: 0,
        READ: 0,
        FAILED: 0,
        CANCELED: 0,
      });
    }
    for (const g of grouped) {
      const slot = totalsByCampaign.get(g.campaignId);
      if (!slot) continue;
      if ((ALL_STATUS_KEYS as readonly string[]).includes(g.status)) {
        slot[g.status as (typeof ALL_STATUS_KEYS)[number]] = g._count._all;
      }
    }

    const throughputByCampaign = new Map<string, number>();
    for (const t of throughputs) throughputByCampaign.set(t.campaignId, t._count._all);

    return rows.map((r) => {
      const totals = totalsByCampaign.get(r.id) ?? {
        PENDING: 0,
        SENT: 0,
        DELIVERED: 0,
        READ: 0,
        FAILED: 0,
        CANCELED: 0,
      };
      const total =
        totals.PENDING +
        totals.SENT +
        totals.DELIVERED +
        totals.READ +
        totals.FAILED +
        totals.CANCELED;
      const cmpCfg = (r.config ?? null) as {
        delayMinMs?: number;
        delayMaxMs?: number;
      } | null;
      const cfgMin = r.channel?.sendDelayMinMs ?? 30_000;
      const cfgMax = r.channel?.sendDelayMaxMs ?? 60_000;
      const hasOverride =
        typeof cmpCfg?.delayMinMs === 'number' || typeof cmpCfg?.delayMaxMs === 'number';
      const delayMinMs = cmpCfg?.delayMinMs ?? cfgMin;
      const delayMaxMs = cmpCfg?.delayMaxMs ?? cfgMax;
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        configId: r.channelId,
        configName: r.channel?.name ?? null,
        templateName: r.template?.metaName ?? null,
        startedAt: r.sentAt,
        total,
        totals,
        throughputLast5min: throughputByCampaign.get(r.id) ?? 0,
        delayMinMs,
        delayMaxMs,
        delaySource: hasOverride ? ('campaign' as const) : ('config' as const),
      };
    });
  }

  private async collectConfigs(since24h: Date): Promise<LiveConfigUsage[]> {
    const configs = (await this.prisma.scoped.channel.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        phoneNumberId: true,
        dailyLimit: true,
        isTestMode: true,
        sendDelayMinMs: true,
        sendDelayMaxMs: true,
      },
    })) as Array<{
      id: string;
      name: string | null;
      phoneNumberId: string;
      dailyLimit: number;
      isTestMode: boolean;
      sendDelayMinMs: number;
      sendDelayMaxMs: number;
    }>;
    if (configs.length === 0) return [];

    const groupedRaw = await this.prisma.scoped.wapiReport.groupBy({
      by: ['campaignId'],
      where: {
        status: 'SENT',
        sentAt: { gte: since24h },
        campaign: { channelId: { in: configs.map((c) => c.id) } },
      },
      _count: { _all: true },
    });
    const grouped = groupedRaw as Array<{
      campaignId: string;
      _count: { _all: number };
    }>;

    // groupBy no acepta agrupar por campaign.configId, así que cargamos el
    // mapping campaignId→configId de las campañas tocadas en el período.
    const campaignIds = grouped.map((g) => g.campaignId);
    const campaignToConfig = new Map<string, string>();
    if (campaignIds.length > 0) {
      const camps = (await this.prisma.scoped.wapiCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, channelId: true },
      })) as Array<{ id: string; channelId: string }>;
      for (const c of camps) campaignToConfig.set(c.id, c.channelId);
    }
    const sentByConfig = new Map<string, number>();
    for (const g of grouped) {
      const cfgId = campaignToConfig.get(g.campaignId);
      if (!cfgId) continue;
      sentByConfig.set(cfgId, (sentByConfig.get(cfgId) ?? 0) + g._count._all);
    }

    return configs.map((c) => {
      const sent = sentByConfig.get(c.id) ?? 0;
      const percent = c.dailyLimit > 0 ? Math.min(100, Math.round((sent / c.dailyLimit) * 100)) : 0;
      return {
        id: c.id,
        name: c.name,
        phoneNumberId: c.phoneNumberId,
        dailyLimit: c.dailyLimit,
        sentLast24h: sent,
        percent,
        isTestMode: c.isTestMode,
        sendDelayMinMs: c.sendDelayMinMs,
        sendDelayMaxMs: c.sendDelayMaxMs,
      };
    });
  }

  private async collectInbox(): Promise<LiveInboxSnapshot> {
    const [unassigned, waiting, escalatedTotal, oldest] = await Promise.all([
      this.prisma.scoped.conversation.count({
        where: { status: 'UNASSIGNED', escalated: true },
      }),
      this.prisma.scoped.conversation.count({
        where: { status: 'WAITING' },
      }),
      this.prisma.scoped.conversation.count({
        where: { escalated: true },
      }),
      this.prisma.scoped.conversation.findFirst({
        where: { status: 'UNASSIGNED', escalated: true },
        orderBy: { lastMessageAt: 'asc' },
        select: { lastMessageAt: true },
      }) as Promise<{ lastMessageAt: Date | null } | null>,
    ]);

    return {
      unassigned,
      waiting,
      escalatedTotal,
      oldestUnassignedAt: oldest?.lastMessageAt ?? null,
    };
  }
}
