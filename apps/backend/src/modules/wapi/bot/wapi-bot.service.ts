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

/**
 * Servicio CRUD del bot por config (4.M). Lee/escribe los campos
 * `botEnabled` / `botSessionTtlMin` / `botFlow` en `WapiConfig`. Valida la
 * estructura del flow antes de persistir — si el flow es inválido se rechaza
 * con 400 (mejor errar al guardar que al recibir un inbound).
 */
@Injectable()
export class WapiBotService {
  private readonly logger = new Logger(WapiBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: WapiMediaService,
  ) {}

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
    const row = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      // Cast: Prisma client puede no estar regenerado todavía con los nuevos
      // campos cuando el dev server está corriendo con la dll cacheada.
      select: {
        id: true,
        botEnabled: true,
        botSessionTtlMin: true,
        botFlow: true,
        botTopics: true,
        botRouter: true,
        botVariables: true,
        botTopicsDraft: true,
        botRouterDraft: true,
        botVariablesDraft: true,
        botDraftUpdatedAt: true,
        botPublishedAt: true,
      } as never,
    });
    if (!row) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    const r = row as unknown as {
      id: string;
      botEnabled: boolean;
      botSessionTtlMin: number;
      botFlow: unknown;
      botTopics: unknown;
      botRouter: unknown;
      botVariables: unknown;
      botTopicsDraft: unknown;
      botRouterDraft: unknown;
      botVariablesDraft: unknown;
      botDraftUpdatedAt: Date | null;
      botPublishedAt: Date | null;
    };
    const draftUpdatedAt = r.botDraftUpdatedAt ?? null;
    const publishedAt = r.botPublishedAt ?? null;
    // Hay cambios sin publicar si existe timestamp de draft y o bien nunca se publicó
    // o el último save del draft es posterior al último publish.
    const hasUnpublishedChanges =
      !!draftUpdatedAt && (!publishedAt || draftUpdatedAt.getTime() > publishedAt.getTime());
    return {
      configId: r.id,
      botEnabled: r.botEnabled,
      botSessionTtlMin: r.botSessionTtlMin,
      botFlow: (r.botFlow ?? null) as BotFlow | null,
      botTopics: (r.botTopics ?? null) as BotTopic[] | null,
      botRouter: (r.botRouter ?? null) as BotRouter | null,
      botVariables: (r.botVariables ?? null) as BotVariable[] | null,
      botTopicsDraft: (r.botTopicsDraft ?? null) as BotTopic[] | null,
      botRouterDraft: (r.botRouterDraft ?? null) as BotRouter | null,
      botVariablesDraft: (r.botVariablesDraft ?? null) as BotVariable[] | null,
      botDraftUpdatedAt: draftUpdatedAt,
      botPublishedAt: publishedAt,
      hasUnpublishedChanges,
    };
  }

  async update(configId: string, dto: UpdateBotInput): Promise<BotConfigSnapshot> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: { id: true } as never,
    });
    if (!current) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);

    const data: Record<string, unknown> = {};
    if (dto.botEnabled !== undefined) data.botEnabled = dto.botEnabled;
    if (dto.botSessionTtlMin !== undefined) {
      if (!Number.isFinite(dto.botSessionTtlMin) || dto.botSessionTtlMin < 1 || dto.botSessionTtlMin > 1440) {
        throw new BadRequestException('botSessionTtlMin debe estar entre 1 y 1440');
      }
      data.botSessionTtlMin = dto.botSessionTtlMin;
    }
    if (dto.botFlow !== undefined) {
      if (dto.botFlow === null) {
        data.botFlow = null;
      } else {
        const validation = validateBotFlow(dto.botFlow);
        if (!validation.ok) {
          throw new BadRequestException({
            message: 'botFlow inválido',
            errors: validation.errors,
          });
        }
        data.botFlow = dto.botFlow;
      }
    }
    // 4.O.1 — topics + router. Validamos en este orden para que router pueda
    // chequear refs contra el set de topics que se está guardando.
    let topicIdsForRouter: ReadonlySet<string> | undefined;
    if (dto.botTopics !== undefined) {
      if (dto.botTopics === null) {
        data.botTopics = null;
      } else {
        const v = validateBotTopics(dto.botTopics);
        if (!v.ok || !v.topics) {
          throw new BadRequestException({ message: 'botTopics inválidos', errors: v.errors });
        }
        data.botTopics = dto.botTopics as never;
        topicIdsForRouter = new Set(v.topics.map((t) => t.id));
      }
    }
    if (dto.botRouter !== undefined) {
      if (dto.botRouter === null) {
        data.botRouter = null;
      } else {
        // Si no estamos actualizando topics en este patch, leemos los existentes
        // para validar las refs del router.
        if (!topicIdsForRouter) {
          const existing = await this.prisma.scoped.wapiConfig.findFirst({
            where: { id: configId },
            select: { botTopics: true } as never,
          });
          const existingTopicsRaw = (existing as unknown as { botTopics: unknown } | null)?.botTopics;
          if (existingTopicsRaw) {
            const v = validateBotTopics(existingTopicsRaw);
            if (v.ok && v.topics) {
              topicIdsForRouter = new Set(v.topics.map((t) => t.id));
            }
          }
        }
        const v = validateBotRouter(dto.botRouter, topicIdsForRouter);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botRouter inválido', errors: v.errors });
        }
        data.botRouter = dto.botRouter as never;
      }
    }
    if (dto.botVariables !== undefined) {
      if (dto.botVariables === null) {
        data.botVariables = null;
      } else {
        const v = validateBotVariables(dto.botVariables);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botVariables inválidas', errors: v.errors });
        }
        data.botVariables = dto.botVariables as never;
      }
    }

    if (Object.keys(data).length === 0) return this.get(configId);

    // Si se está activando el bot pero no hay flow ni topics (ni se está
    // enviando ninguno), bloqueamos para evitar dejar el bot encendido vacío.
    if (data.botEnabled === true && data.botFlow === undefined && data.botTopics === undefined) {
      const existing = await this.prisma.scoped.wapiConfig.findFirst({
        where: { id: configId },
        select: { botFlow: true, botTopics: true } as never,
      });
      const e = existing as unknown as { botFlow: unknown; botTopics: unknown } | null;
      if (!e?.botFlow && !e?.botTopics) {
        throw new BadRequestException('No se puede activar el bot sin botFlow ni botTopics');
      }
    }

    await this.prisma.scoped.wapiConfig.update({
      where: { id: configId },
      data: data as never,
    });
    this.logger.log(`Bot config actualizado configId=${configId} fields=${Object.keys(data).join(',')}`);
    return this.get(configId);
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
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        botTopicsDraft: true,
        botRouterDraft: true,
        botTopics: true,
      } as never,
    });
    if (!current) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    const c = current as unknown as {
      botTopicsDraft: unknown;
      botRouterDraft: unknown;
      botTopics: unknown;
    };

    const data: Record<string, unknown> = {};
    let topicIdsForRouter: ReadonlySet<string> | undefined;

    if (dto.botTopics !== undefined) {
      if (dto.botTopics === null) {
        data.botTopicsDraft = null;
      } else {
        const v = validateBotTopics(dto.botTopics);
        if (!v.ok || !v.topics) {
          throw new BadRequestException({ message: 'botTopics inválidos', errors: v.errors });
        }
        data.botTopicsDraft = dto.botTopics as never;
        topicIdsForRouter = new Set(v.topics.map((t) => t.id));
      }
    }

    if (dto.botRouter !== undefined) {
      if (dto.botRouter === null) {
        data.botRouterDraft = null;
      } else {
        if (!topicIdsForRouter) {
          // Si el draft no actualiza topics, validamos contra topics del draft
          // (si existe) o de prod como fallback.
          const sourceTopicsRaw = c.botTopicsDraft ?? c.botTopics;
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
        data.botRouterDraft = dto.botRouter as never;
      }
    }

    if (dto.botVariables !== undefined) {
      if (dto.botVariables === null) {
        data.botVariablesDraft = null;
      } else {
        const v = validateBotVariables(dto.botVariables);
        if (!v.ok) {
          throw new BadRequestException({ message: 'botVariables inválidas', errors: v.errors });
        }
        data.botVariablesDraft = dto.botVariables as never;
      }
    }

    if (Object.keys(data).length === 0) return this.get(configId);

    data.botDraftUpdatedAt = new Date();

    await this.prisma.scoped.wapiConfig.update({
      where: { id: configId },
      data: data as never,
    });
    this.logger.log(
      `Bot draft actualizado configId=${configId} fields=${Object.keys(data).filter((k) => k !== 'botDraftUpdatedAt').join(',')}`,
    );
    return this.get(configId);
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
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        botTopicsDraft: true,
        botRouterDraft: true,
        botVariablesDraft: true,
        botTopics: true,
        botRouter: true,
        botVariables: true,
        botDraftUpdatedAt: true,
      } as never,
    });
    if (!current) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    const c = current as unknown as {
      botTopicsDraft: unknown;
      botRouterDraft: unknown;
      botVariablesDraft: unknown;
      botTopics: unknown;
      botRouter: unknown;
      botVariables: unknown;
      botDraftUpdatedAt: Date | null;
    };

    if (!c.botDraftUpdatedAt) {
      throw new BadRequestException('No hay borrador para publicar');
    }

    // El draft puede tener sólo topics, sólo router, o ambos. Si una mitad
    // está vacía en el draft, publicamos lo que ya está en prod para esa mitad.
    const nextTopicsRaw = c.botTopicsDraft ?? c.botTopics ?? null;
    const nextRouterRaw = c.botRouterDraft ?? c.botRouter ?? null;
    const nextVariablesRaw = c.botVariablesDraft ?? c.botVariables ?? null;

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
      botTopics: nextTopicsRaw,
      botRouter: nextRouterRaw,
      botVariables: nextVariablesRaw,
      botTopicsDraft: null,
      botRouterDraft: null,
      botVariablesDraft: null,
      botDraftUpdatedAt: null,
      botPublishedAt: new Date(),
    };

    await this.prisma.scoped.wapiConfig.update({
      where: { id: configId },
      data: data as never,
    });
    this.logger.log(`Bot publicado configId=${configId}`);
    return this.get(configId);
  }

  /**
   * 4.O.3 — Descarta el borrador. Limpia botTopicsDraft / botRouterDraft /
   * botDraftUpdatedAt. La versión publicada queda intacta.
   */
  async discardDraft(configId: string): Promise<BotConfigSnapshot> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: { id: true } as never,
    });
    if (!current) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);

    await this.prisma.scoped.wapiConfig.update({
      where: { id: configId },
      data: {
        botTopicsDraft: null,
        botRouterDraft: null,
        botVariablesDraft: null,
        botDraftUpdatedAt: null,
      } as never,
    });
    this.logger.log(`Bot draft descartado configId=${configId}`);
    return this.get(configId);
  }
}
