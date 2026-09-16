import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { InboxService } from './inbox.service';

const TICK_MS = 60_000;
const MAX_PER_CHANNEL = 100;

/**
 * Cierre por inactividad. Una conversación que quedó del lado humano
 * (`botSuspended`) y pasa `Channel.autoCloseAfterMin` minutos sin mensajes se
 * resuelve sola: el bot vuelve a atender al cliente la próxima vez que escriba,
 * y si el canal tiene `autoCloseMessage` se le manda esa despedida.
 *
 * Sólo en canales con bot conectado — sin bot no hay a quién devolverla, y un
 * inbox 100% humano no debería cerrarse solo.
 *
 * Mismo criterio que `BotWaitingExpirerService`: `setInterval` simple, lectura
 * cross-tenant con `prisma` directo, y la escritura dentro del TenantContext del
 * canal vía `InboxService.autoCloseInactive` (cuyo claim condicional hace seguro
 * correr en varias instancias).
 */
@Injectable()
export class InboxAutoCloseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxAutoCloseService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.warn(`tick falló: ${err instanceof Error ? err.message : String(err)}`);
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

  async tick(now: Date = new Date()): Promise<{ closed: number }> {
    if (this.running) return { closed: 0 };
    this.running = true;
    try {
      const channels = await this.prisma.channel.findMany({
        where: { isActive: true, autoCloseAfterMin: { gt: 0 }, botId: { not: null } },
        select: {
          id: true,
          organizationId: true,
          teamId: true,
          autoCloseAfterMin: true,
          autoCloseMessage: true,
        },
      });

      let closed = 0;
      for (const ch of channels) {
        const cutoff = new Date(now.getTime() - ch.autoCloseAfterMin * 60_000);
        const stale = await this.prisma.conversation.findMany({
          where: {
            channelId: ch.id,
            status: { not: 'RESOLVED' },
            botSuspended: true,
            lastMessageAt: { lt: cutoff },
          },
          select: { id: true },
          take: MAX_PER_CHANNEL,
        });
        if (stale.length === 0) continue;

        const ctx: RequestContext = {
          userId: 'system:auto-close',
          organizationId: ch.organizationId,
          teamId: ch.teamId,
          orgRole: 'OWNER',
          teamRole: 'ADMIN',
        };
        for (const conv of stale) {
          try {
            const ok = await TenantContext.run(ctx, () =>
              this.inbox.autoCloseInactive(conv.id, {
                afterMin: ch.autoCloseAfterMin,
                message: ch.autoCloseMessage,
              }),
            );
            if (ok) closed++;
          } catch (err) {
            this.logger.warn(
              `auto-close falló conv=${conv.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
      if (closed > 0) this.logger.log(`Conversaciones cerradas por inactividad: ${closed}`);
      return { closed };
    } finally {
      this.running = false;
    }
  }
}
