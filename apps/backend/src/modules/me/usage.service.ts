import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { QuotaService } from '../../common/quota/quota.service';
import type {
  MeUsageResponse,
  MeUsageLastCampaign,
  UsageMetricSnapshot,
} from '@massivo/shared-types';

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

    const [
      emailQuota,
      wapiQuota,
      dedicatedDomainsUsed,
      lastEmail,
      lastWapi,
      org,
    ] = await Promise.all([
      this.quota.getSnapshot(organizationId, 'EMAIL'),
      this.quota.getSnapshot(organizationId, 'WAPI'),
      // Cuenta sólo los VERIFIED — los PENDING todavía no son una identidad
      // utilizable, no aportan capacidad de envío.
      this.prisma.emailDomain.count({
        where: { organizationId, status: 'VERIFIED' },
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
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { plan: { select: { code: true, name: true, limits: true } } },
      }),
    ]);

    const limits = (org.plan.limits ?? {}) as Record<string, unknown>;
    const dedicatedDomainsLimit = normalizeLimit(limits.dedicatedDomains);

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
