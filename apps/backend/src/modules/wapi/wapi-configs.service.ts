import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EncryptionService } from '../../common/security/encryption.service';
import type { CreateWapiConfigDto, UpdateWapiConfigDto } from './wapi-configs.dto';

export interface WapiConfigListItem {
  id: string;
  name: string | null;
  phoneNumberId: string;
  businessAccountId: string;
  isActive: boolean;
  isTestMode: boolean;
  createdAt: Date;
  /** Phase 0b (multi-canal): bot conectado a este canal (null si ninguno). */
  botId: string | null;
}

export interface WapiConfigDetail extends WapiConfigListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  optOutKeywords: string[];
  dailyLimit: number;
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
  updatedAt: Date;
}

/** 4.Q — valida min ≤ max del throttle. Considera defaults persistidos para edits parciales. */
function assertDelayRange(min: number | undefined, max: number | undefined, current?: { sendDelayMinMs: number; sendDelayMaxMs: number }): void {
  const effectiveMin = min ?? current?.sendDelayMinMs;
  const effectiveMax = max ?? current?.sendDelayMaxMs;
  if (effectiveMin === undefined || effectiveMax === undefined) return;
  if (effectiveMin > effectiveMax) {
    throw new BadRequestException('sendDelayMinMs debe ser ≤ sendDelayMaxMs');
  }
}

function normalizeKeywords(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const k = raw.trim().toUpperCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function toListItem(row: any): WapiConfigListItem {
  return {
    id: row.id,
    name: row.name,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    isActive: row.isActive,
    isTestMode: row.isTestMode ?? false,
    createdAt: row.createdAt,
    botId: row.botId ?? null,
  };
}

@Injectable()
export class WapiConfigsService {
  private readonly logger = new Logger(WapiConfigsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para consultar WapiConfigs');
    }
    return ctx;
  }

  async findAll(): Promise<WapiConfigListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.channel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toListItem);
  }

  async findOne(id: string): Promise<WapiConfigDetail> {
    this.requireContext();
    const row = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }
    return {
      id: row.id,
      name: row.name,
      phoneNumberId: row.phoneNumberId,
      businessAccountId: row.businessAccountId,
      isActive: row.isActive,
      isTestMode: row.isTestMode ?? false,
      botId: row.botId ?? null,
      welcomeMessage: row.welcomeMessage,
      optOutConfirmMessage: row.optOutConfirmMessage,
      optOutKeywords: row.optOutKeywords ?? [],
      dailyLimit: row.dailyLimit,
      sendDelayMinMs: row.sendDelayMinMs,
      sendDelayMaxMs: row.sendDelayMaxMs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(dto: CreateWapiConfigDto): Promise<WapiConfigListItem> {
    const ctx = this.requireContext();
    assertDelayRange(dto.sendDelayMinMs, dto.sendDelayMaxMs);
    const row = await this.prisma.scoped.channel.create({
      data: {
        name: dto.name,
        phoneNumberId: dto.phoneNumberId,
        businessAccountId: dto.businessAccountId,
        accessTokenEnc: this.encryption.encrypt(dto.accessToken),
        webhookVerifyTokenEnc: this.encryption.encrypt(dto.webhookVerifyToken),
        appSecretEnc: dto.appSecret ? this.encryption.encrypt(dto.appSecret) : dto.appSecret,
        welcomeMessage: dto.welcomeMessage,
        optOutConfirmMessage: dto.optOutConfirmMessage,
        optOutKeywords: normalizeKeywords(dto.optOutKeywords),
        dailyLimit: dto.dailyLimit,
        sendDelayMinMs: dto.sendDelayMinMs,
        sendDelayMaxMs: dto.sendDelayMaxMs,
        isTestMode: dto.isTestMode ?? false,
      } as Prisma.ChannelUncheckedCreateInput,
    });
    this.logger.log(`WapiConfig created: ${row.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return toListItem(row);
  }

  async update(id: string, dto: UpdateWapiConfigDto): Promise<WapiConfigListItem> {
    this.requireContext();
    const current = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    assertDelayRange(dto.sendDelayMinMs, dto.sendDelayMaxMs, {
      sendDelayMinMs: current.sendDelayMinMs,
      sendDelayMaxMs: current.sendDelayMaxMs,
    });

    const updateData: any = {
      name: dto.name,
      phoneNumberId: dto.phoneNumberId,
      businessAccountId: dto.businessAccountId,
      welcomeMessage: dto.welcomeMessage,
      optOutConfirmMessage: dto.optOutConfirmMessage,
      dailyLimit: dto.dailyLimit,
      sendDelayMinMs: dto.sendDelayMinMs,
      sendDelayMaxMs: dto.sendDelayMaxMs,
      isActive: dto.isActive,
      isTestMode: dto.isTestMode,
    };
    if (dto.optOutKeywords !== undefined) {
      updateData.optOutKeywords = normalizeKeywords(dto.optOutKeywords);
    }

    if (dto.accessToken !== undefined) updateData.accessTokenEnc = this.encryption.encrypt(dto.accessToken);
    if (dto.webhookVerifyToken !== undefined) updateData.webhookVerifyTokenEnc = this.encryption.encrypt(dto.webhookVerifyToken);
    if (dto.appSecret !== undefined) {
      updateData.appSecretEnc = dto.appSecret === null ? null : this.encryption.encrypt(dto.appSecret);
    }

    const row = await this.prisma.scoped.channel.update({
      where: { id },
      data: updateData,
    });
    return toListItem(row);
  }

  /**
   * 4.P — devuelve los secretos en claro para que el usuario los pegue en Meta
   * (verifyToken al setear el webhook). Restringido por policy a OWNER/ADMIN
   * de la org. Logueamos cada acceso para auditoría.
   */
  async revealSecrets(id: string): Promise<{ webhookVerifyToken: string }> {
    const ctx = this.requireContext();
    const row = await this.prisma.scoped.channel.findFirst({
      where: { id },
      select: { id: true, webhookVerifyTokenEnc: true },
    });
    if (!row) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }
    this.logger.warn(
      `WapiConfig.revealSecrets: org=${ctx.organizationId} user=${ctx.userId} config=${id}`,
    );
    return {
      webhookVerifyToken: this.encryption.decrypt(row.webhookVerifyTokenEnc),
    };
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const current = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    await this.prisma.scoped.channel.delete({
      where: { id },
    });
    this.logger.log(`WapiConfig deleted: ${id}`);
  }
}
