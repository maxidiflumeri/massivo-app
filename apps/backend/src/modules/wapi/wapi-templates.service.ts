import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateWapiTemplateDto, UpdateWapiTemplateDto } from './wapi-templates.dto';

export interface WapiTemplateListItem {
  id: string;
  metaName: string;
  category: string;
  language: string;
  status: string;
  createdAt: Date;
}

export interface WapiTemplateDetail extends WapiTemplateListItem {
  businessAccountId: string;
  components: any;
  buttonActions: any;
  syncedAt: Date;
}

function toListItem(row: any): WapiTemplateListItem {
  return {
    id: row.id,
    metaName: row.metaName,
    category: row.category,
    language: row.language,
    status: row.status,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class WapiTemplatesService {
  private readonly logger = new Logger(WapiTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para consultar WapiTemplates');
    }
    return ctx;
  }

  async findAll(): Promise<WapiTemplateListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.wapiTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toListItem);
  }

  async findOne(id: string): Promise<WapiTemplateDetail> {
    this.requireContext();
    const row = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`WapiTemplate ${id} no encontrado en este scope`);
    }
    return {
      id: row.id,
      metaName: row.metaName,
      businessAccountId: row.businessAccountId,
      category: row.category,
      language: row.language,
      status: row.status,
      components: row.components,
      buttonActions: row.buttonActions,
      syncedAt: row.syncedAt,
      createdAt: row.createdAt,
    };
  }

  async create(dto: CreateWapiTemplateDto): Promise<WapiTemplateDetail> {
    const ctx = this.requireContext();
    const row = await this.prisma.scoped.wapiTemplate.create({
      data: {
        metaName: dto.metaName,
        businessAccountId: dto.businessAccountId ?? '',
        category: dto.category,
        language: dto.language,
        status: dto.status,
        components: dto.components as object,
        buttonActions: dto.buttonActions ? (dto.buttonActions as object) : null,
        syncedAt: new Date(),
      } as Prisma.WapiTemplateUncheckedCreateInput,
    });
    this.logger.log(`WapiTemplate created: ${row.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return {
      id: row.id,
      metaName: row.metaName,
      businessAccountId: row.businessAccountId,
      category: row.category,
      language: row.language,
      status: row.status,
      components: row.components,
      buttonActions: row.buttonActions,
      syncedAt: row.syncedAt,
      createdAt: row.createdAt,
    };
  }

  async update(id: string, dto: UpdateWapiTemplateDto): Promise<WapiTemplateDetail> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiTemplate ${id} no encontrado en este scope`);
    }

    const row = await this.prisma.scoped.wapiTemplate.update({
      where: { id },
      data: {
        ...(dto.metaName !== undefined && { metaName: dto.metaName }),
        ...(dto.businessAccountId !== undefined && { businessAccountId: dto.businessAccountId }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.components !== undefined && { components: dto.components as object }),
        ...(dto.buttonActions !== undefined && { buttonActions: dto.buttonActions === null ? Prisma.DbNull : (dto.buttonActions as object) }),
      } as Prisma.WapiTemplateUncheckedUpdateInput,
    });

    return {
      id: row.id,
      metaName: row.metaName,
      businessAccountId: row.businessAccountId,
      category: row.category,
      language: row.language,
      status: row.status,
      components: row.components,
      buttonActions: row.buttonActions,
      syncedAt: row.syncedAt,
      createdAt: row.createdAt,
    };
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const current = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiTemplate ${id} no encontrado en este scope`);
    }

    await this.prisma.scoped.wapiTemplate.delete({
      where: { id },
    });
    this.logger.log(`WapiTemplate deleted: ${id}`);
  }
}
