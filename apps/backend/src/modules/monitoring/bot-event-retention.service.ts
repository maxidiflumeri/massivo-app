import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const TICK_MS = 6 * 60 * 60_000; // 6 h
const FIRST_TICK_MS = 60_000; // no competir con el arranque
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Monitoreo — poda de `BotEvent`. La tabla es append-only y crece con cada paso
 * del bot, así que borramos lo más viejo que `BOT_EVENT_RETENTION_DAYS`.
 *
 * Cross-tenant (usa `prisma` directo, no `scoped`) y apoyado en el índice
 * `[createdAt]`. Mismo criterio que `BotWaitingExpirerService`: `setInterval`
 * en vez de `@nestjs/schedule`, y multi-instancia seguro — si dos procesos
 * corren el tick a la vez, el segundo no encuentra filas.
 */
@Injectable()
export class BotEventRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotEventRetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get retentionDays(): number {
    const raw = Number(process.env.BOT_EVENT_RETENTION_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RETENTION_DAYS;
  }

  onModuleInit() {
    this.firstTimer = setTimeout(() => void this.safeTick(), FIRST_TICK_MS);
    if (typeof this.firstTimer.unref === 'function') this.firstTimer.unref();
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.timer) clearInterval(this.timer);
    this.firstTimer = null;
    this.timer = null;
  }

  private async safeTick(): Promise<void> {
    try {
      await this.tick();
    } catch (err) {
      this.logger.warn(`tick falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async tick(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.botEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(
        `BotEvent: ${count} evento(s) purgado(s) (retención ${this.retentionDays} días)`,
      );
    }
    return { deleted: count };
  }
}
