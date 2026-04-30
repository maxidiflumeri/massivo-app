import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import type { TrackingPayload } from './tracking-token.service';

interface TrackEventInput {
  payload: TrackingPayload;
  type: 'OPEN' | 'CLICK';
  targetUrl?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Persiste EmailEvent y, si es el primero de su tipo para el report, marca
 * report.firstOpenedAt / firstClickedAt. Idempotente: si ya hay event reciente
 * (<2s) del mismo type para el report no se duplica (proteje contra doble-click,
 * preview de proxies de email).
 */
@Injectable()
export class TrackService {
  private readonly logger = new Logger(TrackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: TrackEventInput): Promise<void> {
    await TenantContext.run(
      {
        userId: 'system:tracking',
        organizationId: input.payload.o,
        teamId: input.payload.t,
        orgRole: 'OWNER',
        teamRole: 'ADMIN',
      },
      async () => {
        const reportId = input.payload.r;
        const targetDomain = input.targetUrl ? safeDomain(input.targetUrl) : undefined;

        const recent = await this.prisma.scoped.emailEvent.findFirst({
          where: {
            reportId,
            type: input.type,
            ...(input.targetUrl ? { targetUrl: input.targetUrl } : {}),
            occurredAt: { gte: new Date(Date.now() - 2000) },
          },
        });
        if (recent) return;

        await this.prisma.scoped.emailEvent.create({
          data: {
            reportId,
            type: input.type,
            targetUrl: input.targetUrl,
            targetDomain,
            ip: input.ip,
            userAgent: input.userAgent,
          } as never,
        });

        const firstField = input.type === 'OPEN' ? 'firstOpenedAt' : 'firstClickedAt';
        await this.prisma.scoped.emailReport.updateMany({
          where: { id: reportId, [firstField]: null },
          data: { [firstField]: new Date() },
        });
      },
    );
  }
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
