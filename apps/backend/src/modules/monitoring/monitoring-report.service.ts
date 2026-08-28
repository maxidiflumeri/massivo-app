import { Injectable } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { MonitoringService, rangeInfo, type RangeInfo } from './monitoring.service';
import type { DateRange } from './monitoring-range';

/** Un nodo del flujo con cuántas visitas lo tocaron. */
export interface ReportNode {
  nodeId: string;
  nodeKind: string | null;
  /** Primeras palabras del texto del nodo: sirve de etiqueta legible. */
  preview: string | null;
  visits: number;
  people: number;
  passes: number;
}

export interface ReportTopic {
  topicId: string;
  visits: number;
  people: number;
  nodes: ReportNode[];
}

export interface MonitoringReport {
  range: RangeInfo;
  generatedAt: string;
  /**
   * `BotEvent` se purga (`BOT_EVENT_RETENTION_DAYS`), así que el recorrido del
   * bot no se puede reconstruir más atrás de `availableFrom`. Los totales de
   * mensajes y visitas salen de `Message`, que no se purga.
   */
  events: { availableFrom: string | null; truncated: boolean };
  totals: {
    messagesIn: number;
    messagesOut: number;
    visits: number;
    people: number;
    newPeople: number;
    returningPeople: number;
    handoffs: number;
  };
  daily: Array<{ day: string; messagesIn: number; messagesOut: number; visits: number }>;
  hourly: Array<{ hour: number; messagesIn: number }>;
  engagement: {
    medianVisitSeconds: number;
    avgVisitSeconds: number;
    medianMessagesPerVisit: number;
    avgMessagesPerVisit: number;
    visitsPerPerson: { one: number; two: number; threeToFive: number; more: number; avg: number };
    replyP50Seconds: number | null;
    replyP95Seconds: number | null;
  };
  channels: Array<{ channelKind: string; visits: number }>;
  topics: ReportTopic[];
  media: {
    attempts: number;
    delivered: number;
    failed: number;
    byError: Array<{ error: string; status: number | null; count: number }>;
    byNode: Array<{
      topicId: string | null;
      nodeId: string;
      attempts: number;
      delivered: number;
      p50Ms: number | null;
    }>;
  };
  http: Array<{
    topicId: string | null;
    nodeId: string;
    /** Sólo esquema + host + path: la query string puede traer datos del ciudadano. */
    endpoint: string | null;
    calls: number;
    errors: number;
    p50Ms: number | null;
    p95Ms: number | null;
  }>;
  captures: Array<{ topicId: string | null; nodeId: string; invalid: number }>;
}

const n = (v: unknown): number => Number(v ?? 0);
const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Arma el paquete de datos del informe descargable: lo mismo que muestra el
 * tablero, más lo que sólo tiene sentido en un documento (fricción por nodo,
 * disponibilidad de los servicios externos, entrega de documentos).
 *
 * Todo se calcula **por visita** (`Message.episodeId`), no por `runId`: el
 * runId cambia en cada arranque de sesión —o sea, casi en cada mensaje— y un
 * embudo contado así mide turnos, no recorridos. Cruzar cada `BotEvent` con la
 * visita que lo contiene es más caro pero da un embudo monotónico: ningún paso
 * puede superar al anterior.
 *
 * Asume estar dentro de `TenantContext.run`. Las queries van en SQL crudo, que
 * **saltea** la extensión de tenant-scope: el WHERE de organización y equipo se
 * arma a mano, como en `MonitoringService`.
 */
@Injectable()
export class MonitoringReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoring: MonitoringService,
  ) {}

  private tenant(): { organizationId: string; teamId: string } {
    const ctx = TenantContext.current();
    if (!ctx?.organizationId || !ctx?.teamId) {
      throw new Error('Contexto de organización/equipo no resuelto');
    }
    return { organizationId: ctx.organizationId, teamId: ctx.teamId };
  }

  async build(range: DateRange): Promise<MonitoringReport> {
    const { organizationId, teamId } = this.tenant();
    const { from, to } = range;

    // El tablero y el informe tienen que decir lo mismo: la serie diaria, la
    // horaria, los canales y las derivadas se toman del overview tal cual.
    const overview = await this.monitoring.getOverview(range);

    const [people, cohorts, engagement, visitsPerPerson, reply, topics, media, mediaErrors, http, captures, firstEvent] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT count(DISTINCT "conversationId") AS count FROM "Message"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND "timestamp" >= ${from} AND "timestamp" < ${to}
        `),
        // Nuevos vs. ya conocidos: se resuelve con `Conversation.createdAt`, que
        // está indexado. Sacar el primer mensaje de cada hilo obligaba a agrupar
        // la tabla entera de mensajes, sin índice que ayude.
        this.prisma.$queryRaw<Array<{ nuevos: bigint; previos: bigint }>>(Prisma.sql`
          SELECT count(*) FILTER (WHERE c."createdAt" >= ${from}) AS nuevos,
                 count(*) FILTER (WHERE c."createdAt" <  ${from}) AS previos
          FROM (
            SELECT DISTINCT "conversationId" AS cid FROM "Message"
            WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
              AND "timestamp" >= ${from} AND "timestamp" < ${to}
          ) a JOIN "Conversation" c ON c.id = a.cid
        `),
        this.prisma.$queryRaw<
          Array<{ med_seg: number; avg_seg: number; med_msgs: number; avg_msgs: number }>
        >(Prisma.sql`
          WITH ep AS (
            SELECT "episodeId", min("timestamp") ini, max("timestamp") fin, count(*) msgs
            FROM "Message"
            WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
              AND "episodeId" IS NOT NULL AND "timestamp" >= ${from} AND "timestamp" < ${to}
            GROUP BY 1
          )
          SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (fin - ini))) AS med_seg,
                 avg(extract(epoch FROM (fin - ini))) AS avg_seg,
                 percentile_disc(0.5) WITHIN GROUP (ORDER BY msgs) AS med_msgs,
                 avg(msgs) AS avg_msgs
          FROM ep
        `),
        this.prisma.$queryRaw<
          Array<{ una: bigint; dos: bigint; tres_cinco: bigint; mas: bigint; prom: number }>
        >(Prisma.sql`
          WITH v AS (
            SELECT "conversationId", count(DISTINCT "episodeId") AS visitas FROM "Message"
            WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
              AND "episodeId" IS NOT NULL AND "timestamp" >= ${from} AND "timestamp" < ${to}
            GROUP BY 1
          )
          SELECT count(*) FILTER (WHERE visitas = 1) AS una,
                 count(*) FILTER (WHERE visitas = 2) AS dos,
                 count(*) FILTER (WHERE visitas BETWEEN 3 AND 5) AS tres_cinco,
                 count(*) FILTER (WHERE visitas > 5) AS mas,
                 avg(visitas) AS prom
          FROM v
        `),
        // Cuánto tarda el bot en contestar: distancia entre un mensaje entrante
        // y el saliente que le sigue. Se descartan los saltos de más de 2 min,
        // que no son una respuesta sino el arranque de otra conversación.
        this.prisma.$queryRaw<Array<{ p50: number | null; p95: number | null }>>(Prisma.sql`
          WITH m AS (
            SELECT "fromMe", "timestamp",
                   lead("timestamp") OVER w AS nxt,
                   lead("fromMe") OVER w AS nxt_from
            FROM "Message"
            WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
              AND "timestamp" >= ${from} AND "timestamp" < ${to}
            WINDOW w AS (PARTITION BY "conversationId" ORDER BY "timestamp")
          )
          SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (nxt - "timestamp"))) AS p50,
                 percentile_disc(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (nxt - "timestamp"))) AS p95
          FROM m
          WHERE "fromMe" = false AND nxt_from = true AND nxt - "timestamp" < interval '2 minutes'
        `),
        this.topicsByVisit(organizationId, teamId, range),
        this.prisma.$queryRaw<
          Array<{
            topic_id: string | null;
            node_id: string;
            attempts: bigint;
            delivered: bigint;
            p50: number | null;
          }>
        >(Prisma.sql`
          SELECT "topicId" AS topic_id, "nodeId" AS node_id,
                 count(*) AS attempts,
                 count(*) FILTER (WHERE NOT (payload ? 'error')) AS delivered,
                 percentile_disc(0.5) WITHIN GROUP (ORDER BY (payload ->> 'durationMs')::int) AS p50
          FROM "BotEvent"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND kind = 'bot.media' AND "nodeId" IS NOT NULL
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1, 2 ORDER BY 3 DESC
        `),
        this.prisma.$queryRaw<Array<{ error: string; status: string | null; count: bigint }>>(Prisma.sql`
          SELECT coalesce(payload ->> 'error', 'ok') AS error,
                 payload ->> 'status' AS status, count(*) AS count
          FROM "BotEvent"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND kind = 'bot.media' AND "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1, 2 ORDER BY 3 DESC
        `),
        this.prisma.$queryRaw<
          Array<{
            topic_id: string | null;
            node_id: string;
            endpoint: string | null;
            calls: bigint;
            errors: bigint;
            p50: number | null;
            p95: number | null;
          }>
        >(Prisma.sql`
          SELECT "topicId" AS topic_id, "nodeId" AS node_id,
                 -- Sin query string: puede traer patente, DNI o nro de causa.
                 min(split_part(payload ->> 'url', '?', 1)) AS endpoint,
                 count(*) AS calls,
                 count(*) FILTER (
                   WHERE payload ? 'error'
                      OR coalesce((payload ->> 'status')::int, 0) NOT BETWEEN 200 AND 299
                 ) AS errors,
                 percentile_disc(0.5) WITHIN GROUP (ORDER BY (payload ->> 'durationMs')::int) AS p50,
                 percentile_disc(0.95) WITHIN GROUP (ORDER BY (payload ->> 'durationMs')::int) AS p95
          FROM "BotEvent"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND kind = 'bot.http' AND "nodeId" IS NOT NULL
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1, 2 ORDER BY 4 DESC
        `),
        this.prisma.$queryRaw<Array<{ topic_id: string | null; node_id: string; count: bigint }>>(Prisma.sql`
          SELECT "topicId" AS topic_id, "nodeId" AS node_id, count(*) AS count
          FROM "BotEvent"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
            AND kind = 'bot.capture.invalid' AND "nodeId" IS NOT NULL
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1, 2 ORDER BY 3 DESC
        `),
        this.prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
          SELECT min("createdAt") AS first FROM "BotEvent"
          WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
        `),
      ]);

    const eng = engagement[0];
    const vpp = visitsPerPerson[0];
    const availableFrom = firstEvent[0]?.first ?? null;

    const mediaAttempts = media.reduce((acc, r) => acc + n(r.attempts), 0);
    const mediaDelivered = media.reduce((acc, r) => acc + n(r.delivered), 0);

    return {
      range: rangeInfo(range),
      generatedAt: new Date().toISOString(),
      events: {
        availableFrom: availableFrom ? availableFrom.toISOString() : null,
        // El recorrido del bot arranca más tarde que el rango pedido: el embudo
        // habla de menos visitas que los totales y hay que avisarlo.
        truncated: !!availableFrom && availableFrom.getTime() > from.getTime(),
      },
      totals: {
        messagesIn: overview.totals.messagesIn,
        messagesOut: overview.totals.messagesOut,
        visits: overview.totals.conversationsActive,
        people: n(people[0]?.count),
        newPeople: n(cohorts[0]?.nuevos),
        returningPeople: n(cohorts[0]?.previos),
        handoffs: overview.botVsEscalated.escalated,
      },
      daily: overview.days.map((d) => ({
        day: d.day,
        messagesIn: d.messagesIn,
        messagesOut: d.messagesOut,
        visits: d.conversations,
      })),
      hourly: overview.hourly,
      engagement: {
        medianVisitSeconds: n(eng?.med_seg),
        avgVisitSeconds: n(eng?.avg_seg),
        medianMessagesPerVisit: n(eng?.med_msgs),
        avgMessagesPerVisit: n(eng?.avg_msgs),
        visitsPerPerson: {
          one: n(vpp?.una),
          two: n(vpp?.dos),
          threeToFive: n(vpp?.tres_cinco),
          more: n(vpp?.mas),
          avg: n(vpp?.prom),
        },
        replyP50Seconds: nOrNull(reply[0]?.p50),
        replyP95Seconds: nOrNull(reply[0]?.p95),
      },
      channels: overview.byChannel.map((c) => ({
        channelKind: c.channelKind,
        visits: c.conversations,
      })),
      topics,
      media: {
        attempts: mediaAttempts,
        delivered: mediaDelivered,
        failed: mediaAttempts - mediaDelivered,
        byError: mediaErrors.map((r) => ({
          error: r.error,
          status: r.status === null ? null : Number(r.status),
          count: n(r.count),
        })),
        byNode: media.map((r) => ({
          topicId: r.topic_id,
          nodeId: r.node_id,
          attempts: n(r.attempts),
          delivered: n(r.delivered),
          p50Ms: nOrNull(r.p50),
        })),
      },
      http: http.map((r) => ({
        topicId: r.topic_id,
        nodeId: r.node_id,
        endpoint: r.endpoint,
        calls: n(r.calls),
        errors: n(r.errors),
        p50Ms: nOrNull(r.p50),
        p95Ms: nOrNull(r.p95),
      })),
      captures: captures.map((r) => ({
        topicId: r.topic_id,
        nodeId: r.node_id,
        invalid: n(r.count),
      })),
    };
  }

  /**
   * Temas y nodos contados **por visita**. Cada `BotEvent` se ata a la visita
   * que lo contiene comparándolo con el primer y último mensaje del episodio
   * (con un minuto de gracia a cada lado: el evento se graba unos instantes
   * antes de que salga el mensaje). `GROUPING SETS` trae tema y tema+nodo en
   * una sola pasada, como en `getPaths`.
   */
  private async topicsByVisit(
    organizationId: string,
    teamId: string,
    { from, to }: DateRange,
  ): Promise<ReportTopic[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        topic_id: string | null;
        node_id: string | null;
        node_kind: string | null;
        preview: string | null;
        visitas: bigint;
        personas: bigint;
        pasadas: bigint;
      }>
    >(Prisma.sql`
      WITH ep AS (
        SELECT "conversationId", "episodeId", min("timestamp") AS ini, max("timestamp") AS fin
        FROM "Message"
        WHERE "organizationId" = ${organizationId} AND "teamId" = ${teamId}
          AND "episodeId" IS NOT NULL
          AND "timestamp" >= ${from} - interval '1 hour'
          AND "timestamp" <  ${to}   + interval '1 hour'
        GROUP BY 1, 2
      ), ev AS (
        SELECT be."topicId", be."nodeId", be."nodeKind", be.payload,
               ep."episodeId", be."conversationId"
        FROM "BotEvent" be
        JOIN ep ON ep."conversationId" = be."conversationId"
               AND be."createdAt" >= ep.ini - interval '1 minute'
               AND be."createdAt" <= ep.fin + interval '1 minute'
        WHERE be."organizationId" = ${organizationId} AND be."teamId" = ${teamId}
          AND be.kind = 'bot.node.entered'
          AND be."createdAt" >= ${from} AND be."createdAt" < ${to}
      )
      SELECT "topicId" AS topic_id, "nodeId" AS node_id,
             min("nodeKind") AS node_kind,
             min(payload ->> 'textPreview') AS preview,
             count(DISTINCT "episodeId") AS visitas,
             count(DISTINCT "conversationId") AS personas,
             count(*) AS pasadas
      FROM ev
      GROUP BY GROUPING SETS (("topicId"), ("topicId", "nodeId"))
    `);

    const byTopic = new Map<string, ReportTopic>();
    const topic = (id: string | null): ReportTopic => {
      const key = id ?? '(sin tema)';
      let t = byTopic.get(key);
      if (!t) {
        t = { topicId: key, visits: 0, people: 0, nodes: [] };
        byTopic.set(key, t);
      }
      return t;
    };

    for (const r of rows) {
      const t = topic(r.topic_id);
      if (r.node_id === null) {
        t.visits = n(r.visitas);
        t.people = n(r.personas);
      } else {
        t.nodes.push({
          nodeId: r.node_id,
          nodeKind: r.node_kind,
          preview: r.preview,
          visits: n(r.visitas),
          people: n(r.personas),
          passes: n(r.pasadas),
        });
      }
    }

    return [...byTopic.values()]
      .map((t) => ({ ...t, nodes: t.nodes.sort((a, b) => b.visits - a.visits) }))
      .sort((a, b) => b.visits - a.visits);
  }
}
