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
  validateBotFlow,
  validateBotRouter,
  validateBotTopics,
  type BotFlow,
  type BotRouter,
  type BotTopic,
} from './wapi-bot.types';

export interface BotConfigSnapshot {
  configId: string;
  botEnabled: boolean;
  botSessionTtlMin: number;
  botFlow: BotFlow | null;
  /** 4.O.1 */
  botTopics: BotTopic[] | null;
  botRouter: BotRouter | null;
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
    };
    return {
      configId: r.id,
      botEnabled: r.botEnabled,
      botSessionTtlMin: r.botSessionTtlMin,
      botFlow: (r.botFlow ?? null) as BotFlow | null,
      botTopics: (r.botTopics ?? null) as BotTopic[] | null,
      botRouter: (r.botRouter ?? null) as BotRouter | null,
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
}
