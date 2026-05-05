import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import type {
  CreateWapiQuickReplyDto,
  UpdateWapiQuickReplyDto,
} from './wapi-quick-replies.dto';

export interface QuickReplyDto {
  id: string;
  shortcut: string;
  body: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WapiQuickRepliesService {
  private readonly logger = new Logger(WapiQuickRepliesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para Quick Replies');
    }
    return ctx;
  }

  async findAll(): Promise<QuickReplyDto[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.wapiQuickReply.findMany({
      orderBy: { shortcut: 'asc' },
    });
    return rows.map(this.toDto);
  }

  async findOne(id: string): Promise<QuickReplyDto> {
    this.requireContext();
    const row = await this.prisma.scoped.wapiQuickReply.findFirst({
      where: { id } as never,
    });
    if (!row) throw new NotFoundException(`QuickReply ${id} no encontrado`);
    return this.toDto(row);
  }

  async create(dto: CreateWapiQuickReplyDto): Promise<QuickReplyDto> {
    const ctx = this.requireContext();
    try {
      const row = await this.prisma.scoped.wapiQuickReply.create({
        data: {
          shortcut: dto.shortcut,
          body: dto.body,
          createdByUserId: ctx.userId,
        } as never,
      });
      return this.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe un quick reply con shortcut "${dto.shortcut}"`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateWapiQuickReplyDto): Promise<QuickReplyDto> {
    this.requireContext();
    await this.findOne(id);
    try {
      const row = await this.prisma.scoped.wapiQuickReply.update({
        where: { id },
        data: {
          ...(dto.shortcut !== undefined ? { shortcut: dto.shortcut } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
        } as never,
      });
      return this.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe un quick reply con shortcut "${dto.shortcut}"`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    await this.findOne(id);
    await this.prisma.scoped.wapiQuickReply.delete({ where: { id } });
  }

  private toDto(row: {
    id: string;
    shortcut: string;
    body: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): QuickReplyDto {
    return {
      id: row.id,
      shortcut: row.shortcut,
      body: row.body,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
