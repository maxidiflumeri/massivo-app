import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Silencio a partir del cual un mensaje abre una visita nueva. Por default 30
 * min, el mismo TTL con el que el bot abre sesión nueva (`Bot.sessionTtlMin`),
 * así "visita" y "sesión del bot" coinciden. El backfill del historial usó este
 * mismo número: si lo cambiás, lo nuevo se corta distinto que lo viejo.
 */
const DEFAULT_TTL_MIN = 30;

/**
 * Monitoreo — "visitas" (episodios) dentro de un hilo.
 *
 * `Conversation` es única por (canal, teléfono) y vive para siempre: el hilo con
 * una persona acumula todo lo que habló en meses. Para poder ver y contar cada
 * vez que volvió, cada mensaje lleva un `episodeId` que se renueva cuando entra
 * después de más de TTL de silencio.
 *
 * La decisión se toma en UN solo `UPDATE ... RETURNING`: es atómico, así que dos
 * mensajes simultáneos del mismo hilo no pueden abrir dos visitas distintas.
 */
@Injectable()
export class ConversationEpisodeService {
  private readonly logger = new Logger(ConversationEpisodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  get ttlMinutes(): number {
    const raw = Number(process.env.EPISODE_TTL_MIN);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MIN;
  }

  /** Id nuevo de visita. Opaco: sólo se usa para agrupar. */
  newEpisodeId(): string {
    return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Devuelve la visita a la que pertenece un mensaje con timestamp `ts`, y la
   * renueva si pasó el TTL desde el último mensaje del hilo.
   *
   * ⚠️ Se apoya en `lastMessageAt`, así que hay que llamarlo **antes** de
   * actualizar ese campo con el timestamp nuevo (si no, el hueco da 0 y nunca
   * abre visita). En el inbound lo llama `ConversationCoreService.upsertConversation`
   * antes del update; en los outbound, el propio emisor antes de persistir.
   */
  async resolveFor(conversationId: string, ts: Date): Promise<string | null> {
    const candidate = this.newEpisodeId();
    try {
      const rows = await this.prisma.$queryRaw<Array<{ currentEpisodeId: string | null }>>(
        Prisma.sql`
          UPDATE "Conversation"
          SET "currentEpisodeId" = CASE
                WHEN "currentEpisodeId" IS NULL
                  OR "lastMessageAt" IS NULL
                  -- ::int explícito: Prisma manda el number como bigint y
                  -- make_interval sólo tiene sobrecarga para int.
                  OR ${ts} - "lastMessageAt" > make_interval(mins => ${this.ttlMinutes}::int)
                THEN ${candidate}
                ELSE "currentEpisodeId"
              END
          WHERE id = ${conversationId}
          RETURNING "currentEpisodeId"
        `,
      );
      return rows[0]?.currentEpisodeId ?? candidate;
    } catch (err) {
      // Nunca romper el envío/ingreso de un mensaje por el agrupado de monitoreo.
      this.logger.warn(
        `no se pudo resolver la visita de ${conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
