import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateWapiConfigDto, UpdateWapiConfigDto } from './wapi-configs.dto';

export interface WapiConfigListItem {
  id: string;
  name: string | null;
  phoneNumberId: string;
  businessAccountId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface WapiConfigDetail extends WapiConfigListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  dailyLimit: number;
  updatedAt: Date;
}

function toListItem(row: any): WapiConfigListItem {
  return {
    id: row.id,
    name: row.name,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class WapiConfigsService {
  private readonly logger = new Logger(WapiConfigsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para consultar WapiConfigs');
    }
    return ctx;
  }

  async findAll(): Promise<WapiConfigListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.wapiConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toListItem);
  }

  async findOne(id: string): Promise<WapiConfigDetail> {
    this.requireContext();
    const row = await this.prisma.scoped.wapiConfig.findFirst({
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
      welcomeMessage: row.welcomeMessage,
      optOutConfirmMessage: row.optOutConfirmMessage,
      dailyLimit: row.dailyLimit,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(dto: CreateWapiConfigDto): Promise<WapiConfigListItem> {
    const ctx = this.requireContext();
    const row = await this.prisma.scoped.wapiConfig.create({
      data: {
        name: dto.name,
        phoneNumberId: dto.phoneNumberId,
        businessAccountId: dto.businessAccountId,
        accessTokenEnc: dto.accessToken, // TODO: Fase 4 - encriptar con KMS
        webhookVerifyTokenEnc: dto.webhookVerifyToken, // TODO: Fase 4 - encriptar
        appSecretEnc: dto.appSecret, // TODO: Fase 4 - encriptar
        welcomeMessage: dto.welcomeMessage,
        optOutConfirmMessage: dto.optOutConfirmMessage,
        dailyLimit: dto.dailyLimit,
      } as Prisma.WapiConfigUncheckedCreateInput,
    });
    this.logger.log(`WapiConfig created: ${row.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return toListItem(row);
  }

  async update(id: string, dto: UpdateWapiConfigDto): Promise<WapiConfigListItem> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    const updateData: any = {
      name: dto.name,
      phoneNumberId: dto.phoneNumberId,
      businessAccountId: dto.businessAccountId,
      welcomeMessage: dto.welcomeMessage,
      optOutConfirmMessage: dto.optOutConfirmMessage,
      dailyLimit: dto.dailyLimit,
      isActive: dto.isActive,
    };

    if (dto.accessToken !== undefined) updateData.accessTokenEnc = dto.accessToken;
    if (dto.webhookVerifyToken !== undefined) updateData.webhookVerifyTokenEnc = dto.webhookVerifyToken;
    if (dto.appSecret !== undefined) updateData.appSecretEnc = dto.appSecret;

    const row = await this.prisma.scoped.wapiConfig.update({
      where: { id },
      data: updateData,
    });
    return toListItem(row);
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    await this.prisma.scoped.wapiConfig.delete({
      where: { id },
    });
    this.logger.log(`WapiConfig deleted: ${id}`);
  }
}
