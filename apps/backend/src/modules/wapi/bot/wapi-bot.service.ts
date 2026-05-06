import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { validateBotFlow, type BotFlow } from './wapi-bot.types';

export interface BotConfigSnapshot {
  configId: string;
  botEnabled: boolean;
  botSessionTtlMin: number;
  botFlow: BotFlow | null;
}

export interface UpdateBotInput {
  botEnabled?: boolean;
  botSessionTtlMin?: number;
  /** Acepta unknown — el service valida contra `validateBotFlow` antes de persistir. */
  botFlow?: unknown;
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

  constructor(private readonly prisma: PrismaService) {}

  private requireContext() {
    return TenantContext.current();
  }

  async get(configId: string): Promise<BotConfigSnapshot> {
    this.requireContext();
    const row = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      // Cast: Prisma client puede no estar regenerado todavía con los nuevos
      // campos cuando el dev server está corriendo con la dll cacheada.
      select: { id: true, botEnabled: true, botSessionTtlMin: true, botFlow: true } as never,
    });
    if (!row) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    const r = row as unknown as {
      id: string;
      botEnabled: boolean;
      botSessionTtlMin: number;
      botFlow: unknown;
    };
    return {
      configId: r.id,
      botEnabled: r.botEnabled,
      botSessionTtlMin: r.botSessionTtlMin,
      botFlow: (r.botFlow ?? null) as BotFlow | null,
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

    if (Object.keys(data).length === 0) return this.get(configId);

    // Si se está activando el bot pero no hay flow ni se está enviando uno,
    // bloqueamos para evitar dejar el bot encendido sin flow utilizable.
    if (data.botEnabled === true && data.botFlow === undefined) {
      const existing = await this.prisma.scoped.wapiConfig.findFirst({
        where: { id: configId },
        select: { botFlow: true } as never,
      });
      const flow = (existing as unknown as { botFlow: unknown } | null)?.botFlow;
      if (!flow) {
        throw new BadRequestException('No se puede activar el bot sin un botFlow definido');
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
