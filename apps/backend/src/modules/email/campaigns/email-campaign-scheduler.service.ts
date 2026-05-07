import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EmailCampaignsService } from './email-campaigns.service';

const TICK_MS = 60_000;
const BATCH_SIZE = 50;

/**
 * 4.R — Worker que dispara campañas Email con `status='SCHEDULED'` y `scheduledAt`
 * vencido. Mismo patrón que `WapiCampaignSchedulerService`.
 */
@Injectable()
export class EmailCampaignSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailCampaignSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: EmailCampaignsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.warn(
          `tick falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ fired: number }> {
    const now = new Date();
    const rows = (await (this.prisma as unknown as {
      emailCampaign: {
        findMany: (args: unknown) => Promise<
          Array<{ id: string; organizationId: string; teamId: string; name: string }>
        >;
      };
    }).emailCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      select: { id: true, organizationId: true, teamId: true, name: true },
      take: BATCH_SIZE,
    })) as Array<{ id: string; organizationId: string; teamId: string; name: string }>;
    if (rows.length === 0) return { fired: 0 };

    let fired = 0;
    for (const row of rows) {
      try {
        await TenantContext.run(
          {
            userId: 'system-scheduler',
            organizationId: row.organizationId,
            teamId: row.teamId,
            orgRole: 'OWNER',
            teamRole: 'ADMIN',
          },
          () => this.campaigns.send(row.id),
        );
        fired++;
        this.logger.log(
          `EmailCampaign ${row.id} (${row.name}) disparada por scheduler`,
        );
      } catch (err) {
        this.logger.warn(
          `disparar ${row.id} falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { fired };
  }
}
