import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateContactDto, UpdateContactDto } from './contacts.dto';

export interface ContactDto {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  attributes: unknown;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ContactDto[]> {
    this.requireContext();
    return this.prisma.scoped.contact.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async findOne(id: string): Promise<ContactDto> {
    this.requireContext();
    const row = await this.prisma.scoped.contact.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Contact no encontrado');
    return row;
  }

  async findByEmail(email: string): Promise<ContactDto | null> {
    this.requireContext();
    return this.prisma.scoped.contact.findFirst({ where: { email } });
  }

  async findByPhone(phone: string): Promise<ContactDto | null> {
    this.requireContext();
    return this.prisma.scoped.contact.findFirst({ where: { phone } });
  }

  async create(dto: CreateContactDto): Promise<ContactDto> {
    const ctx = this.requireContext();

    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Contact requiere al menos email o phone');
    }

    try {
      const row = await this.prisma.scoped.contact.create({
        data: {
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          attributes: (dto.attributes as object | undefined) ?? Prisma.JsonNull,
        } as Prisma.ContactUncheckedCreateInput,
      });
      this.logger.log(`Contact created: ${row.id} in team ${ctx.teamId}`);
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un contact con ese email o phone en este team');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateContactDto): Promise<ContactDto> {
    this.requireContext();
    const existing = await this.prisma.scoped.contact.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Contact no encontrado');

    try {
      const row = await this.prisma.scoped.contact.update({
        where: { id },
        data: {
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
          ...(dto.attributes !== undefined && {
            attributes: dto.attributes === null ? Prisma.JsonNull : (dto.attributes as object),
          }),
        },
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un contact con ese email o phone en este team');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const existing = await this.prisma.scoped.contact.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Contact no encontrado');
    await this.prisma.scoped.contact.delete({ where: { id } });
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
