import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { WapiCampaignsService } from './wapi-campaigns.service';

const TICK_MS = 60_000;
const BATCH_SIZE = 50;

/**
 * 4.R — Worker que dispara campañas WAPI con `status='SCHEDULED'` y `scheduledAt`
 * vencido. Llama a `WapiCampaignsService.send()` bajo un TenantContext sintético
 * con la org/team de cada campaña.
 *
 * No usa `prisma.scoped` — corre cross-tenant. Multi-instance es seguro: `send()`
 * marca PROCESSING en transacción, así que si dos workers compiten en la misma
 * fila el segundo recibe ConflictException y se ignora silenciosamente.
 */
@Injectable()
export class WapiCampaignSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WapiCampaignSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: WapiCampaignsService,
    private readonly auditLog: AuditLogService,
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
      wapiCampaign: {
        findMany: (args: unknown) => Promise<
          Array<{ id: string; organizationId: string; teamId: string; name: string }>
        >;
      };
    }).wapiCampaign.findMany({
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
          async () => {
            await this.campaigns.send(row.id);
            await this.auditLog.log({
              action: 'wapi.campaign.sent',
              resourceType: 'WapiCampaign',
              resourceId: row.id,
              actorUserId: null,
              metadata: { source: 'scheduler', name: row.name },
            });
          },
        );
        fired++;
        this.logger.log(
          `WapiCampaign ${row.id} (${row.name}) disparada por scheduler`,
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
