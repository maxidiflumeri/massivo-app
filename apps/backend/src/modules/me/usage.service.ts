import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { QuotaService } from '../../common/quota/quota.service';
import type {
  MeUsageResponse,
  MeUsageLastCampaign,
  UsageMetricSnapshot,
} from '@massivo/shared-types';

/**
 * Cuántos dominios de envío dedicados (SmtpAccount provider=ses) puede tener
 * la org según su plan. No vive en Plan.limits todavía — cuando exista de
 * verdad un modelo EmailDomain con verificación SES propia se va a migrar.
 * -1 = ilimitado.
 */
const DEDICATED_DOMAINS_BY_PLAN: Record<string, number> = {
  FREE: 1,
  STARTER: 3,
  BUSINESS: 10,
  ENTERPRISE: -1,
};

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  async getUsage(): Promise<MeUsageResponse> {
    const ctx = TenantContext.current();
    if (!ctx) {
      // El guard ya rechaza si no hay contexto, esto es defensivo.
      throw new Error('Falta tenant context');
    }
    const { organizationId } = ctx;

    const [emailQuota, wapiQuota, dedicatedDomainsUsed, lastEmail, lastWapi] =
      await Promise.all([
        this.quota.getSnapshot(organizationId, 'EMAIL'),
        this.quota.getSnapshot(organizationId, 'WAPI'),
        this.prisma.smtpAccount.count({
          where: { organizationId, provider: 'ses' },
        }),
        this.prisma.emailCampaign.findFirst({
          where: { organizationId, archived: false },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, status: true, updatedAt: true },
        }),
        this.prisma.wapiCampaign.findFirst({
          where: { organizationId, archived: false },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, status: true, updatedAt: true },
        }),
      ]);

    // Plan code y nombre los traigo de la org (no del snapshot — el snapshot
    // no expone el nombre comercial). Hago una sola query extra.
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { plan: { select: { code: true, name: true } } },
    });

    const dedicatedDomainsLimit = normalizeLimit(
      DEDICATED_DOMAINS_BY_PLAN[org.plan.code],
    );

    return {
      planCode: org.plan.code,
      planName: org.plan.name,
      periodStart: emailQuota.periodStart.toISOString(),
      periodEnd: emailQuota.periodEnd.toISOString(),
      metrics: {
        emails: snapshot(emailQuota.used, emailQuota.limit),
        wapiMessages: snapshot(wapiQuota.used, wapiQuota.limit),
        dedicatedDomains: snapshot(dedicatedDomainsUsed, dedicatedDomainsLimit),
      },
      lastEmailCampaign: toLastCampaign(lastEmail),
      lastWapiCampaign: toLastCampaign(lastWapi),
    };
  }
}

function snapshot(used: number, limit: number | null): UsageMetricSnapshot {
  return { used, limit };
}

function normalizeLimit(raw: unknown): number | null {
  if (typeof raw !== 'number') return 0;
  if (raw < 0) return null;
  return raw;
}

function toLastCampaign(
  row: { id: string; name: string; status: string; updatedAt: Date } | null,
): MeUsageLastCampaign | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}
