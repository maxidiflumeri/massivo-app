import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';

const VALID_WINDOWS = [7, 30] as const;
export type MonitoringWindow = (typeof VALID_WINDOWS)[number];

export function isValidWindow(n: number): n is MonitoringWindow {
  return (VALID_WINDOWS as readonly number[]).includes(n);
}

/**
 * Zona horaria de los buckets diarios/horarios. El bot atiende a la Provincia
 * de Buenos Aires: un mensaje de las 22:00 ART debe caer en ese día local, no
 * en el siguiente UTC.
 */
const TZ = 'America/Argentina/Buenos_Aires';

export interface MonitoringOverview {
  windowDays: MonitoringWindow;
  from: string;
  to: string;
  totals: {
    /** Conversaciones CREADAS en la ventana. */
    conversations: number;
    /**
     * Conversaciones con al menos un mensaje en la ventana, sin importar cuándo
     * se crearon. Es lo que responde "cuánto se movió": una conversación vieja
     * que vuelve a hablar hoy cuenta acá, no en `conversations`.
     */
    conversationsActive: number;
    messagesIn: number;
    messagesOut: number;
    handoffs: number;
    activeSessions: number;
  };
  days: Array<{
    day: string; // YYYY-MM-DD (hora local)
    conversations: number;
    messagesIn: number;
    messagesOut: number;
  }>;
  hourly: Array<{ hour: number; messagesIn: number }>;
  byChannel: Array<{ channelKind: string; conversations: number }>;
  botVsEscalated: { bot: number; escalated: number };
}

export interface BotEventItem {
  id: string;
  kind: string;
  nodeId: string | null;
  nodeKind: string | null;
  topicId: string | null;
  sessionId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface EpisodeItem {
  episodeId: string;
  startedAt: string;
  endedAt: string;
  messages: number;
  messagesIn: number;
  /** La visita terminó con el bot derivando a un operador. */
  handedOff: boolean;
  /** Primer mensaje del usuario en la visita — sirve de título. */
  firstInbound: string | null;
}

export interface BotSessionSnapshot {
  currentNodeId: string;
  currentTopicId: string | null;
  startedAt: string;
  lastInboundAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedReason: string | null;
  data: unknown;
}

/**
 * Monitoreo — agregados y timeline del bot para la sección del panel. Asume
 * estar dentro de `TenantContext.run` (el interceptor lo garantiza).
 *
 * Las series diarias/horarias van por SQL crudo: Prisma no tiene `date_trunc` y
 * bucketear en JS obligaría a traerse todas las filas. Ojo: el raw **saltea** la
 * extensión de tenant-scope, así que el WHERE de `organizationId`/`teamId` se
 * arma a mano desde el contexto. El resto de las queries usa `prisma.scoped`.
 */
@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private tenant(): { organizationId: string; teamId: string } {
    const ctx = TenantContext.current();
    if (!ctx?.organizationId || !ctx?.teamId) {
      // No debería pasar: TenantContextGuard corre antes que el handler.
      throw new NotFoundException('Contexto de organización/equipo no resuelto');
    }
    return { organizationId: ctx.organizationId, teamId: ctx.teamId };
  }

  async getOverview(days: MonitoringWindow): Promise<MonitoringOverview> {
    const { organizationId, teamId } = this.tenant();
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [convRows, msgRows, hourRows, byChannel, handoffs, activeSessions, escalatedCount, totalConv, activeConvRows] =
      await Promise.all([
        // Visitas iniciadas por día: se bucketea el PRIMER mensaje de cada
        // episodio, no la creación del hilo (que es de la primera vez, hace meses).
        this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(Prisma.sql`
          WITH visitas AS (
            SELECT "episodeId", min("timestamp") AS inicio
            FROM "Message"
            WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
              AND "episodeId" IS NOT NULL
            GROUP BY "episodeId"
          )
          SELECT date_trunc('day', (inicio AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS day,
                 count(*) AS count
          FROM visitas
          WHERE inicio >= ${from} AND inicio <= ${to}
          GROUP BY 1 ORDER BY 1
        `),
        this.prisma.$queryRaw<Array<{ day: Date; from_me: boolean; count: bigint }>>(Prisma.sql`
          SELECT date_trunc('day', ("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS day,
                 "fromMe" AS from_me, count(*) AS count
          FROM "Message"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND "timestamp" >= ${from} AND "timestamp" <= ${to}
          GROUP BY 1, 2 ORDER BY 1
        `),
        this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>(Prisma.sql`
          SELECT date_part('hour', ("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS hour,
                 count(*) AS count
          FROM "Message"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND "timestamp" >= ${from} AND "timestamp" <= ${to} AND "fromMe" = false
          GROUP BY 1 ORDER BY 1
        `),
        this.prisma.$queryRaw<Array<{ channel_kind: string; count: bigint }>>(Prisma.sql`
          SELECT c."channelKind" AS channel_kind, count(DISTINCT m."episodeId") AS count
          FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
          WHERE m."organizationId" = ${organizationId} AND m."teamId" = ${teamId}
            AND m."timestamp" >= ${from} AND m."timestamp" <= ${to}
            AND m."episodeId" IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC
        `),
        this.prisma.scoped.botEvent.count({
          where: { kind: 'bot.handoff', createdAt: { gte: from, lte: to } },
        }),
        this.prisma.scoped.botSession.count({
          where: { endedAt: null, expiresAt: { gt: to } },
        }),
        // Derivadas: visitas donde el bot dejó un mensaje de HANDOFF. El engine
        // siempre estampó `system.kind='bot-handoff'`, así que anda retroactivo.
        this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT count(DISTINCT "episodeId") AS count
          FROM "Message"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND "timestamp" >= ${from} AND "timestamp" <= ${to}
            AND "episodeId" IS NOT NULL
            AND content -> 'system' ->> 'kind' = 'bot-handoff'
        `),
        this.prisma.scoped.conversation.count({ where: { createdAt: { gte: from, lte: to } } }),
        // Conversaciones "que se movieron": distinct sobre Message, no sobre
        // fecha de creación (una del mes pasado que escribe hoy cuenta acá).
        this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT count(DISTINCT "episodeId") AS count
          FROM "Message"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND "timestamp" >= ${from} AND "timestamp" <= ${to}
        `),
      ]);

    // Serie continua: incluimos los días sin tráfico para que el gráfico no
    // "salte" fechas.
    const convByDay = new Map(convRows.map((r) => [dayKey(r.day), Number(r.count)]));
    const inByDay = new Map<string, number>();
    const outByDay = new Map<string, number>();
    let messagesIn = 0;
    let messagesOut = 0;
    for (const r of msgRows) {
      const key = dayKey(r.day);
      const n = Number(r.count);
      if (r.from_me) {
        outByDay.set(key, n);
        messagesOut += n;
      } else {
        inByDay.set(key, n);
        messagesIn += n;
      }
    }

    const daysSeries: MonitoringOverview['days'] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKey(new Date(to.getTime() - i * 24 * 60 * 60 * 1000), TZ);
      daysSeries.push({
        day: key,
        conversations: convByDay.get(key) ?? 0,
        messagesIn: inByDay.get(key) ?? 0,
        messagesOut: outByDay.get(key) ?? 0,
      });
    }

    const activas = Number(activeConvRows[0]?.count ?? 0);
    const derivadas = Number(escalatedCount[0]?.count ?? 0);

    const hourMap = new Map(hourRows.map((r) => [Number(r.hour), Number(r.count)]));
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      messagesIn: hourMap.get(hour) ?? 0,
    }));

    return {
      windowDays: days,
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        conversations: totalConv,
        conversationsActive: activas,
        messagesIn,
        messagesOut,
        handoffs,
        activeSessions,
      },
      days: daysSeries,
      hourly,
      byChannel: byChannel.map((g) => ({
        channelKind: String(g.channel_kind),
        conversations: Number(g.count),
      })),
      botVsEscalated: { bot: activas - derivadas, escalated: derivadas },
    };
  }

  /**
   * Timeline del bot de una conversación, ascendente (orden de ocurrencia).
   * Cursor = id de la última fila devuelta.
   */
  async listBotEvents(
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: BotEventItem[]; nextCursor: string | null }> {
    await this.assertConversation(conversationId);
    const rows = await this.prisma.scoped.botEvent.findMany({
      where: { conversationId, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      id: r.id,
      kind: r.kind,
      nodeId: r.nodeId,
      nodeKind: r.nodeKind,
      topicId: r.topicId,
      sessionId: r.sessionId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    }));
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
  }

  /**
   * "Visitas" de un hilo, de la más nueva a la más vieja. El hilo es único por
   * contacto y acumula meses de charla; esto lo parte en las veces que la
   * persona efectivamente volvió a escribir.
   */
  async listEpisodes(conversationId: string): Promise<EpisodeItem[]> {
    await this.assertConversation(conversationId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        episode_id: string;
        started_at: Date;
        ended_at: Date;
        messages: bigint;
        messages_in: bigint;
        handed_off: boolean;
        first_inbound: string | null;
      }>
    >(Prisma.sql`
      SELECT "episodeId" AS episode_id,
             min("timestamp") AS started_at,
             max("timestamp") AS ended_at,
             count(*) AS messages,
             count(*) FILTER (WHERE "fromMe" = false) AS messages_in,
             bool_or(content -> 'system' ->> 'kind' = 'bot-handoff') AS handed_off,
             (array_remove(array_agg(
                content -> 'text' ->> 'body' ORDER BY "timestamp"
              ) FILTER (WHERE "fromMe" = false), NULL))[1] AS first_inbound
      FROM "Message"
      WHERE "conversationId" = ${conversationId} AND "episodeId" IS NOT NULL
      GROUP BY "episodeId"
      ORDER BY started_at DESC
    `);
    return rows.map((r) => ({
      episodeId: r.episode_id,
      startedAt: r.started_at.toISOString(),
      endedAt: r.ended_at.toISOString(),
      messages: Number(r.messages),
      messagesIn: Number(r.messages_in),
      handedOff: !!r.handed_off,
      firstInbound: r.first_inbound,
    }));
  }

  /** Estado actual de la sesión del bot (nodo parado + variables capturadas). */
  async getBotSession(conversationId: string): Promise<BotSessionSnapshot | null> {
    const conv = await this.assertConversation(conversationId);
    const session = await this.prisma.scoped.botSession.findFirst({
      where: { channelId: conv.channelId, externalUserId: conv.externalUserId },
    });
    if (!session) return null;
    return {
      currentNodeId: session.currentNodeId,
      currentTopicId: session.currentTopicId,
      startedAt: session.startedAt.toISOString(),
      lastInboundAt: session.lastInboundAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      endedReason: session.endedReason,
      data: session.data,
    };
  }

  /** 404 si la conversación no existe o es de otro tenant (scoped la filtra). */
  private async assertConversation(id: string) {
    const conv = await this.prisma.scoped.conversation.findUnique({
      where: { id },
      select: { id: true, channelId: true, externalUserId: true },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return conv;
  }
}

/**
 * `date_trunc(... AT TIME ZONE tz)` devuelve un timestamp sin tz que el driver
 * interpreta como UTC; sus componentes YA son la hora local, así que la clave
 * se arma con los getters UTC. Cuando la fecha viene de `new Date()` (serie
 * continua) sí hay que convertirla a la zona con `tz`.
 */
function dayKey(d: Date, tz?: string): string {
  if (tz) {
    // en-CA da YYYY-MM-DD directo.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
  return d.toISOString().slice(0, 10);
}
