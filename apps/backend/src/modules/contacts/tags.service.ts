import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateTagDto, UpdateTagDto } from './contacts.dto';

export interface TagDto {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<TagDto[]> {
    this.requireContext();
    return this.prisma.scoped.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<TagDto> {
    this.requireContext();
    const row = await this.prisma.scoped.tag.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Tag no encontrado');
    return row;
  }

  async create(dto: CreateTagDto): Promise<TagDto> {
    this.requireContext();
    try {
      const row = await this.prisma.scoped.tag.create({
        data: {
          name: dto.name,
          color: dto.color ?? null,
        } as Prisma.TagUncheckedCreateInput,
      });
      this.logger.log(`Tag created: ${row.id}`);
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un tag con ese nombre en este team');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateTagDto): Promise<TagDto> {
    this.requireContext();
    const existing = await this.prisma.scoped.tag.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Tag no encontrado');
    try {
      return await this.prisma.scoped.tag.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un tag con ese nombre en este team');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const existing = await this.prisma.scoped.tag.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Tag no encontrado');
    await this.prisma.scoped.tag.delete({ where: { id } });
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
