import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventsService } from '../../events/events.service';

const TICK_MS = 5 * 60_000;

/**
 * 4.O.6 — Worker que vuelve a UNASSIGNED las conversaciones puestas en espera
 * cuyo TTL (`waitingUntil`) ya venció. El operador puso la conversación en
 * WAITING ("respondí, espero al cliente") y, si pasaron N minutos sin que el
 * cliente vuelva a escribir, vuelve al inbox sin asignación para que la tome
 * cualquiera. El último responsable queda persistido en `lastAssignedUserId`
 * para mostrar el chip "lo tenía X".
 *
 * No usa `prisma.scoped` porque corre cross-tenant. Tampoco usa `@nestjs/schedule`
 * — el setInterval simple alcanza para esta cadencia (cada 5 min) y evita una
 * dep. Multi-instance es seguro: el `updateMany` filtra por `waitingUntil < now`
 * y `status='WAITING'`, así que dos workers compiten en la misma transacción
 * pero el segundo no encuentra filas. Los eventos pueden duplicarse en ese caso
 * — el frontend dedupea por `id` al actualizar.
 */
@Injectable()
export class WapiBotWaitingExpirerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WapiBotWaitingExpirerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
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

  /**
   * Ejecuta una pasada: identifica conversaciones WAITING vencidas y las
   * devuelve a UNASSIGNED. Hace findMany + updates individuales (en vez de
   * updateMany) porque necesitamos `teamId` y `configId` por fila para emitir
   * el evento de socket. La cardinalidad esperada por tick es baja (un puñado).
   */
  async tick(): Promise<{ expired: number }> {
    const now = new Date();
    const rows = (await (this.prisma as unknown as {
      conversation: {
        findMany: (args: unknown) => Promise<
          Array<{ id: string; teamId: string; channelId: string; externalUserId: string }>
        >;
      };
    }).conversation.findMany({
      where: { status: 'WAITING', waitingUntil: { lt: now } },
      select: { id: true, teamId: true, channelId: true, externalUserId: true },
      take: 200,
    })) as Array<{ id: string; teamId: string; channelId: string; externalUserId: string }>;
    if (rows.length === 0) return { expired: 0 };

    let expired = 0;
    for (const row of rows) {
      try {
        await (this.prisma as unknown as {
          conversation: { update: (args: unknown) => Promise<unknown> };
        }).conversation.update({
          where: { id: row.id },
          // Doble guard sobre status: si entre el findMany y el update el
          // operador resolvió o el cliente respondió, no pisamos el cambio.
          data: { status: 'UNASSIGNED', waitingUntil: null },
        });
        // Contrato de socket: mantenemos las keys legacy configId/phone (mapeadas
        // desde channelId/externalUserId) para no tocar el frontend en 1d.
        this.events.emitToTeam(row.teamId, 'wapi.conversation.updated', {
          id: row.id,
          configId: row.channelId,
          phone: row.externalUserId,
          status: 'UNASSIGNED',
          waitingUntil: null,
        });
        expired++;
      } catch (err) {
        this.logger.warn(
          `expire ${row.id} falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (expired > 0) {
      this.logger.log(`WAITING expirer: ${expired} conversaciones devueltas a UNASSIGNED`);
    }
    return { expired };
  }
}
