import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { InboxService } from './inbox.service';

const TICK_MS = 60_000;
const MAX_PER_CHANNEL = 100;

/**
 * TTL de inactividad por canal (`Channel.autoCloseAfterMin`), para cualquier
 * conversación abierta:
 *  - del lado humano (`botSuspended`) sin mensajes → se resuelve y vuelve al bot;
 *  - del lado del bot (sesión abierta) sin respuesta del cliente → se cierra la
 *    sesión.
 * En ambos casos se dispara la acción de inactividad (hoy: `autoCloseMessage`).
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
        const ctx: RequestContext = {
          userId: 'system:auto-close',
          organizationId: ch.organizationId,
          teamId: ch.teamId,
          orgRole: 'OWNER',
          teamRole: 'ADMIN',
        };
        const opts = { afterMin: ch.autoCloseAfterMin, message: ch.autoCloseMessage };

        // Lado humano: conversación con un operador a cargo.
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
        for (const conv of stale) {
          closed += await this.safely(`conv=${conv.id}`, () =>
            TenantContext.run(ctx, () => this.inbox.autoCloseInactive(conv.id, opts)),
          );
        }

        // Lado bot: sesión abierta sin respuesta del cliente (vencida o no).
        const idleSessions = await this.prisma.botSession.findMany({
          where: { channelId: ch.id, endedAt: null, lastInboundAt: { lt: cutoff } },
          select: { id: true },
          take: MAX_PER_CHANNEL,
        });
        for (const sess of idleSessions) {
          closed += await this.safely(`session=${sess.id}`, () =>
            TenantContext.run(ctx, () => this.inbox.closeIdleBotSession(sess.id, opts)),
          );
        }
      }
      if (closed > 0) this.logger.log(`Cerradas por inactividad: ${closed}`);
      return { closed };
    } finally {
      this.running = false;
    }
  }

  /** Un error en una conversación no corta las demás. Devuelve 1 si cerró. */
  private async safely(label: string, fn: () => Promise<boolean>): Promise<number> {
    try {
      return (await fn()) ? 1 : 0;
    } catch (err) {
      this.logger.warn(`auto-close falló ${label}: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }
}
