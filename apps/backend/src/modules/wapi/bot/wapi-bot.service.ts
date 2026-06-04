import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiMediaService } from '../media/wapi-media.service';
import { detectTypeFromMime, type WapiMediaType } from '../media/wapi-media.types';
import {
  inferImplicitVariables,
  validateBotFlow,
  validateBotRouter,
  validateBotTopics,
  validateBotVariables,
  type BotFlow,
  type BotRouter,
  type BotTopic,
  type BotVariable,
} from './wapi-bot.types';

export interface BotConfigSnapshot {
  configId: string;
  botEnabled: boolean;
  botSessionTtlMin: number;
  botFlow: BotFlow | null;
  /** 4.O.1 — versión publicada (la que ejecuta el motor en prod) */
  botTopics: BotTopic[] | null;
  botRouter: BotRouter | null;
  /** 4.O.4 — variables declarativas publicadas. */
  botVariables: BotVariable[] | null;
  /** 4.O.3 — borrador en edición. null si no hay cambios sin publicar. */
  botTopicsDraft: BotTopic[] | null;
  botRouterDraft: BotRouter | null;
  /** 4.O.4 — variables del borrador. */
  botVariablesDraft: BotVariable[] | null;
  botDraftUpdatedAt: Date | null;
  botPublishedAt: Date | null;
  /** True si el draft tiene cambios respecto a la versión publicada (basado en timestamps). */
  hasUnpublishedChanges: boolean;
}

export interface UpdateBotInput {
  botEnabled?: boolean;
  botSessionTtlMin?: number;
  /** Acepta unknown — el service valida contra `validateBotFlow` antes de persistir. */
  botFlow?: unknown;
  /** 4.O.1 — array de BotTopic. Validado contra `validateBotTopics`. */
  botTopics?: unknown;
  /** 4.O.1 — BotRouter. Validado contra `validateBotRouter`. */
  botRouter?: unknown;
  /** 4.O.4 — array de BotVariable. Validado contra `validateBotVariables`. */
  botVariables?: unknown;
}

export interface SaveBotDraftInput {
  /** undefined = no tocar; null = limpiar; otherwise reemplaza completo. */
  botTopics?: unknown;
  botRouter?: unknown;
  /** 4.O.4 — variables declaradas del draft. */
  botVariables?: unknown;
}

/** Forma interna leída de `Bot` (campos de definición). */
interface BotRow {
  id: string;
  enabled: boolean;
  sessionTtlMin: number;
  flow: unknown;
  topics: unknown;
  router: unknown;
  variables: unknown;
  topicsDraft: unknown;
  routerDraft: unknown;
  variablesDraft: unknown;
  draftUpdatedAt: Date | null;
  publishedAt: Date | null;
}

const BOT_SELECT = {
  id: true,
  enabled: true,
  sessionTtlMin: true,
  flow: true,
  topics: true,
  router: true,
  variables: true,
  topicsDraft: true,
  routerDraft: true,
  variablesDraft: true,
  draftUpdatedAt: true,
  publishedAt: true,
} as const;

/**
 * Servicio CRUD del bot (4.M). Phase 0a (multi-canal): la definición del bot
 * vive en la entidad `Bot` (extraída de las columnas `bot*` de `WapiConfig`).
 * El bot se resuelve vía `WapiConfig.botId`; si el config no tiene bot todavía,
 * `update`/`saveDraft` crean uno y lo linkean (lazy). El contrato público
 * (`BotConfigSnapshot`, llaveado por `configId`) NO cambia — la API y el frontend
 * siguen iguales. Valida la estructura del flow antes de persistir — si es
 * inválido se rechaza con 400 (mejor errar al guardar que al recibir un inbound).
 */
@Injectable()
export class WapiBotService {
  private readonly logger = new Logger(WapiBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: WapiMediaService,
  ) {}

  /**
   * Resuelve el `Bot` de un config vía `WapiConfig.botId`. Si `create=true` y el
   * config no tiene bot, crea uno (org/team del config) y lo linkea. Devuelve
   * null si no hay bot y `create=false`.
   */
  private async resolveBot(configId: string, opts: { create: boolean }): Promise<BotRow | null> {
    const config = (await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        botId: true,
        name: true,
        phoneNumberId: true,
        organizationId: true,
        teamId: true,
      } as never,
    })) as unknown as {
      id: string;
      botId: string | null;
      name: string | null;
      phoneNumberId: string;
      organizationId: string;
      teamId: string;
    } | null;
    if (!config) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);

    if (config.botId) {
      const bot = (await this.prisma.scoped.bot.findFirst({
        where: { id: config.botId },
        select: BOT_SELECT,
      })) as unknown as BotRow | null;
      if (bot) return bot;
      // botId colgante (no debería pasar) → cae a crear si está permitido.
    }
    if (!opts.create) return null;

    const created = (await this.prisma.scoped.bot.create({
      data: {
        organizationId: config.organizationId,
        teamId: config.teamId,
        name: config.name?.trim() || `Bot ${config.phoneNumberId}`,
      },
      select: BOT_SELECT,
    })) as unknown as BotRow;
    await this.prisma.scoped.wapiConfig.update({
      where: { id: configId },
      data: { botId: created.id } as never,
    });
    this.logger.log(`Bot creado y linkeado configId=${configId} botId=${created.id}`);
    return created;
  }

  private emptySnapshot(configId: string): BotConfigSnapshot {
    return {
      configId,
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: null,
      botRouter: null,
      botVariables: null,
      botTopicsDraft: null,
      botRouterDraft: null,
      botVariablesDraft: null,
      botDraftUpdatedAt: null,
      botPublishedAt: null,
      hasUnpublishedChanges: false,
    };
  }

  private toSnapshot(configId: string, bot: BotRow): BotConfigSnapshot {
    const draftUpdatedAt = bot.draftUpdatedAt ?? null;
    const publishedAt = bot.publishedAt ?? null;
    // Hay cambios sin publicar si existe timestamp de draft y o bien nunca se publicó
    // o el último save del draft es posterior al último publish.
    const hasUnpublishedChanges =
      !!draftUpdatedAt && (!publishedAt || draftUpdatedAt.getTime() > publishedAt.getTime());
    return {
      configId,
      botEnabled: bot.enabled,
      botSessionTtlMin: bot.sessionTtlMin,
      botFlow: (bot.flow ?? null) as BotFlow | null,
      botTopics: (bot.topics ?? null) as BotTopic[] | null,
      botRouter: (bot.router ?? null) as BotRouter | null,
      botVariables: (bot.variables ?? null) as BotVariable[] | null,
      botTopicsDraft: (bot.topicsDraft ?? null) as BotTopic[] | null,
      botRouterDraft: (bot.routerDraft ?? null) as BotRouter | null,
      botVariablesDraft: (bot.variablesDraft ?? null) as BotVariable[] | null,
      botDraftUpdatedAt: draftUpdatedAt,
      botPublishedAt: publishedAt,
      hasUnpublishedChanges,
    };
  }

  /**
   * Sube un archivo a Meta para usar como mediaId dentro de un nodo MEDIA del
   * bot (4.N.2). Devuelve el `mediaId` que el editor debe persistir en el
   * flow. No envía el mensaje — el envío lo hace el motor cuando el cliente
   * llega al nodo. Reusa `WapiMediaService.uploadToMeta`.
   *
   * En `isTestMode=true` corta antes de tocar Graph (el token es dummy):
   * persiste el binario en el storage local y devuelve un `mediaId` sintético
   * `SIM_<sha256-prefix>`. El sender ya short-circuitea en test-mode, así que
   * el id sintético nunca llega a Meta.
   */
  async uploadFlowMedia(
    configId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<{
    mediaId: string;
    mediaType: WapiMediaType;
    size: number;
    mime: string;
    /** Path relativo a WAPI_MEDIA_DIR — se persiste en el nodo MEDIA para que el motor lo copie al WapiMessage. */
    localPath: string;
    sha256: string;
  }> {
    this.requireContext();
    const type = detectTypeFromMime(file.mimetype);
    if (!type) {
      throw new BadRequestException(`Mime "${file.mimetype}" no soportado`);
    }
    if (type === 'sticker') {
      throw new BadRequestException('Sticker no está soportado en nodos del bot');
    }

    const cfg = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: { id: true, isTestMode: true } as never,
    });
    if (!cfg) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    const isTest = (cfg as unknown as { isTestMode: boolean }).isTestMode === true;

    if (isTest) {
      this.media.validateUpload(type, file.mimetype, file.buffer.length);
      const local = await this.media.persistInboundLocal(configId, file.buffer, file.mimetype);
      const mediaId = `SIM_${local.sha256.slice(0, 16)}`;
      this.logger.debug(
        `[isTestMode] uploadFlowMedia short-circuit configId=${configId} mediaId=${mediaId}`,
      );
      return {
        mediaId,
        mediaType: type,
        size: local.size,
        mime: file.mimetype,
        localPath: local.localPath,
        sha256: local.sha256,
      };
    }

    const result = await this.media.uploadToMeta({
      configId,
      type,
      buffer: file.buffer,
      mime: file.mimetype,
      filename: file.originalname,
    });
    return {
      mediaId: result.mediaId,
      mediaType: type,
      size: result.size,
      mime: file.mimetype,
      localPath: result.localPath,
      sha256: result.sha256,
    };
  }

  private requireContext() {
    return TenantContext.current();
  }

  async get(configId: string): Promise<BotConfigSnapshot> {
    this.requireContext();
    const bot = await this.resolveBot(configId, { create: false });
    if (!bot) return this.emptySnapshot(configId);
    return this.toSnapshot(configId, bot);
  }

  async update(configId: string, dto: UpdateBotInput): Promise<BotConfigSnapshot> {
    this.requireContext();
    const bot = (await this.resolveBot(configId, { create: true })) as BotRow;

    // Mapeo DTO (nombres `bot*`) → columnas de `Bot`.
    const data: Record<string, unknown> = {};
    if (dto.botEnabled !== undefined) data.enabled = dto.botEnabled;
    if (dto.botSessionTtlMin !== undefined) {
      if (!Number.isFinite(dto.botSessionTtlMin) || dto.botSessionTtlMin < 1 || dto.botSessionTtlMin > 1440) {
        throw new BadRequestException('botSessionTtlMin debe estar entre 1 y 1440');
      }
      data.sessionTtlMin = dto.botSessionTtlMin;
    }
    if (dto.botFlow !== undefined) {
      if (dto.botFlow === null) {
        data.flow = null;
      } else {
        const validation = validateBotFlow(dto.botFlow);
        if (!validation.ok) {
          throw new BadRequestException({
            message: 'botFlow inválido',
            errors: validation.errors,
          });
        }
        data.flow = dto.botFlow;
      }
    }
    // 4.O.1 — topics + router. Validamos en este orden para que router pueda
    // chequear refs contra el set de topics que se está guardando.
    let topicIdsForRouter: ReadonlySet<string> | undefined;
    if (dto.botTopics !== undefined) {
      if (dto.botTopics === null) {
        data.topics = null;
      } else {
        const v = validateBotTopics(dto.botTopics);
        if (!v.ok || !v.topics) {
          throw new BadRequestException({ message: 'botTopics inválidos', errors: v.errors });
        }
        data.topics = dto.botTopics as never;
        topicIdsForRouter = new Set(v.topics.map((t) => t.id));
      }
    }
    if (dto.botRouter !== undefined) {
      if (dto.botRouter === null) {
        data.router = null;
      } else {
        // Si no estamos actualizando topics en este patch, validamos las refs del
        // router contra los topics ya persistidos en el Bot.
        if (!topicIdsForRouter && bot.topics) {
          const v = validateBotTopics(bot.topics);
          if (v.ok && v.topics) {
            topicIdsForRouter = new Set(v.topics.map((t) => t.id));
          }
        }
        const v = validateBotRouter(dto.botRouter, topicIdsForRouter);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botRouter inválido', errors: v.errors });
        }
        data.router = dto.botRouter as never;
      }
    }
    if (dto.botVariables !== undefined) {
      if (dto.botVariables === null) {
        data.variables = null;
      } else {
        const v = validateBotVariables(dto.botVariables);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botVariables inválidas', errors: v.errors });
        }
        data.variables = dto.botVariables as never;
      }
    }

    if (Object.keys(data).length === 0) return this.toSnapshot(configId, bot);

    // Si se está activando el bot pero no hay flow ni topics (ni se está
    // enviando ninguno), bloqueamos para evitar dejar el bot encendido vacío.
    if (data.enabled === true && data.flow === undefined && data.topics === undefined) {
      if (!bot.flow && !bot.topics) {
        throw new BadRequestException('No se puede activar el bot sin botFlow ni botTopics');
      }
    }

    const updated = (await this.prisma.scoped.bot.update({
      where: { id: bot.id },
      data: data as never,
      select: BOT_SELECT,
    })) as unknown as BotRow;
    this.logger.log(`Bot actualizado configId=${configId} botId=${bot.id} fields=${Object.keys(data).join(',')}`);
    return this.toSnapshot(configId, updated);
  }

  /**
   * 4.O.3 — Guarda el borrador (botTopicsDraft / botRouterDraft) sin tocar la
   * versión publicada. Usado por el editor visual: cada save acá NO impacta
   * al motor de prod. Recién al hacer `publish()` se copia a las columnas
   * activas. Valida estructura igual que `update()`.
   *
   * Si el caller manda `botRouter` pero no `botTopics`, valida las refs del
   * router contra los topics que estén en el draft (o en prod si el draft
   * está vacío) — así un router publicado puede actualizarse sin re-enviar
   * los topics.
   */
  async saveDraft(configId: string, dto: SaveBotDraftInput): Promise<BotConfigSnapshot> {
    this.requireContext();
    const bot = (await this.resolveBot(configId, { create: true })) as BotRow;

    const data: Record<string, unknown> = {};
    let topicIdsForRouter: ReadonlySet<string> | undefined;

    if (dto.botTopics !== undefined) {
      if (dto.botTopics === null) {
        data.topicsDraft = null;
      } else {
        const v = validateBotTopics(dto.botTopics);
        if (!v.ok || !v.topics) {
          throw new BadRequestException({ message: 'botTopics inválidos', errors: v.errors });
        }
        data.topicsDraft = dto.botTopics as never;
        topicIdsForRouter = new Set(v.topics.map((t) => t.id));
      }
    }

    if (dto.botRouter !== undefined) {
      if (dto.botRouter === null) {
        data.routerDraft = null;
      } else {
        if (!topicIdsForRouter) {
          // Si el draft no actualiza topics, validamos contra topics del draft
          // (si existe) o de prod como fallback.
          const sourceTopicsRaw = bot.topicsDraft ?? bot.topics;
          if (sourceTopicsRaw) {
            const v = validateBotTopics(sourceTopicsRaw);
            if (v.ok && v.topics) {
              topicIdsForRouter = new Set(v.topics.map((t) => t.id));
            }
          }
        }
        const v = validateBotRouter(dto.botRouter, topicIdsForRouter);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botRouter inválido', errors: v.errors });
        }
        data.routerDraft = dto.botRouter as never;
      }
    }

    if (dto.botVariables !== undefined) {
      if (dto.botVariables === null) {
        data.variablesDraft = null;
      } else {
        const v = validateBotVariables(dto.botVariables);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botVariables inválidas', errors: v.errors });
        }
        data.variablesDraft = dto.botVariables as never;
      }
    }

    if (Object.keys(data).length === 0) return this.toSnapshot(configId, bot);

    data.draftUpdatedAt = new Date();

    const updated = (await this.prisma.scoped.bot.update({
      where: { id: bot.id },
      data: data as never,
      select: BOT_SELECT,
    })) as unknown as BotRow;
    this.logger.log(
      `Bot draft actualizado configId=${configId} botId=${bot.id} fields=${Object.keys(data).filter((k) => k !== 'draftUpdatedAt').join(',')}`,
    );
    return this.toSnapshot(configId, updated);
  }

  /**
   * 4.O.3 — Publica el borrador a producción. Copia botTopicsDraft → botTopics
   * y botRouterDraft → botRouter, limpia las columnas de draft, y sella
   * `botPublishedAt`. Valida la coherencia draft↔refs como defensa adicional.
   *
   * Falla si no hay draft (botDraftUpdatedAt null) — no tiene sentido publicar
   * "nada".
   */
  async publish(configId: string): Promise<BotConfigSnapshot> {
    this.requireContext();
    const bot = await this.resolveBot(configId, { create: false });
    if (!bot || !bot.draftUpdatedAt) {
      throw new BadRequestException('No hay borrador para publicar');
    }

    // El draft puede tener sólo topics, sólo router, o ambos. Si una mitad
    // está vacía en el draft, publicamos lo que ya está en prod para esa mitad.
    const nextTopicsRaw = bot.topicsDraft ?? bot.topics ?? null;
    const nextRouterRaw = bot.routerDraft ?? bot.router ?? null;
    const nextVariablesRaw = bot.variablesDraft ?? bot.variables ?? null;

    let topicIds: ReadonlySet<string> | undefined;
    if (nextTopicsRaw !== null) {
      const v = validateBotTopics(nextTopicsRaw);
      if (!v.ok || !v.topics) {
        throw new BadRequestException({
          message: 'botTopics inválido — no se puede publicar',
          errors: v.errors,
        });
      }
      topicIds = new Set(v.topics.map((t) => t.id));
    }
    if (nextRouterRaw !== null) {
      const v = validateBotRouter(nextRouterRaw, topicIds);
      if (!v.ok) {
        throw new BadRequestException({
          message: 'botRouter inválido — no se puede publicar',
          errors: v.errors,
        });
      }
    }
    if (nextVariablesRaw !== null) {
      const v = validateBotVariables(nextVariablesRaw);
      if (!v.ok) {
        throw new BadRequestException({
          message: 'botVariables inválidas — no se puede publicar',
          errors: v.errors,
        });
      }
    }

    const data: Record<string, unknown> = {
      topics: nextTopicsRaw,
      router: nextRouterRaw,
      variables: nextVariablesRaw,
      topicsDraft: null,
      routerDraft: null,
      variablesDraft: null,
      draftUpdatedAt: null,
      publishedAt: new Date(),
    };

    const updated = (await this.prisma.scoped.bot.update({
      where: { id: bot.id },
      data: data as never,
      select: BOT_SELECT,
    })) as unknown as BotRow;
    this.logger.log(`Bot publicado configId=${configId} botId=${bot.id}`);
    return this.toSnapshot(configId, updated);
  }

  /**
   * 4.O.3 — Descarta el borrador. Limpia botTopicsDraft / botRouterDraft /
   * botDraftUpdatedAt. La versión publicada queda intacta.
   */
  async discardDraft(configId: string): Promise<BotConfigSnapshot> {
    this.requireContext();
    const bot = await this.resolveBot(configId, { create: false });
    if (!bot) return this.emptySnapshot(configId);

    const updated = (await this.prisma.scoped.bot.update({
      where: { id: bot.id },
      data: {
        topicsDraft: null,
        routerDraft: null,
        variablesDraft: null,
        draftUpdatedAt: null,
      } as never,
      select: BOT_SELECT,
    })) as unknown as BotRow;
    this.logger.log(`Bot draft descartado configId=${configId} botId=${bot.id}`);
    return this.toSnapshot(configId, updated);
  }
}
