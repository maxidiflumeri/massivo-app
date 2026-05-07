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
import type {
  CreateContactDto,
  FindByIdentityQueryDto,
  ListContactsQueryDto,
  UpdateContactDto,
} from './contacts.dto';
import {
  normalizeCuit,
  normalizeDni,
  normalizeEmail,
  normalizeExternalId,
  normalizePhoneE164,
} from './identity';

export interface ContactDto {
  id: string;
  organizationId: string;
  teamId: string | null;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  attributes: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactPage {
  items: ContactDto[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListContactsQueryDto): Promise<ContactPage> {
    this.requireContext();
    const limit = clampLimit(params.limit);
    const where = this.buildListWhere(params);

    const rows = await this.prisma.scoped.contact.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    if (rows.length > limit) {
      const items = rows.slice(0, limit) as ContactDto[];
      return { items, nextCursor: items[items.length - 1]!.id };
    }
    return { items: rows as ContactDto[], nextCursor: null };
  }

  async findOne(id: string): Promise<ContactDto> {
    this.requireContext();
    const row = await this.prisma.scoped.contact.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Contact no encontrado');
    return row as ContactDto;
  }

  async findByIdentity(query: FindByIdentityQueryDto): Promise<ContactDto | null> {
    this.requireContext();
    const externalId = normalizeExternalId(query.externalId);
    if (externalId) {
      const row = await this.prisma.scoped.contact.findFirst({ where: { externalId } });
      if (row) return row as ContactDto;
    }
    const dni = normalizeDni(query.dni);
    if (dni) {
      const row = await this.prisma.scoped.contact.findFirst({ where: { dni } });
      if (row) return row as ContactDto;
    }
    const cuit = normalizeCuit(query.cuit);
    if (cuit) {
      const row = await this.prisma.scoped.contact.findFirst({ where: { cuit } });
      if (row) return row as ContactDto;
    }
    const email = normalizeEmail(query.email);
    if (email) {
      const row = await this.prisma.scoped.contact.findFirst({ where: { email } });
      if (row) return row as ContactDto;
    }
    const phoneE164 = normalizePhoneE164(query.phone);
    if (phoneE164) {
      const row = await this.prisma.scoped.contact.findFirst({ where: { phoneE164 } });
      if (row) return row as ContactDto;
    }
    return null;
  }

  async create(dto: CreateContactDto): Promise<ContactDto> {
    const ctx = this.requireContext();

    const externalId = normalizeExternalId(dto.externalId);
    const dni = this.parseDni(dto.dni);
    const cuit = this.parseCuit(dto.cuit);
    const email = normalizeEmail(dto.email);
    const phoneE164 = normalizePhoneE164(dto.phoneE164 ?? dto.phone);
    const phone = dto.phone?.trim() || (phoneE164 ?? null);

    if (!externalId && !dni && !cuit && !email && !phoneE164) {
      throw new BadRequestException(
        'Contact requiere al menos uno de externalId, dni, cuit, email o phone válido',
      );
    }

    try {
      const row = await this.prisma.scoped.contact.create({
        data: {
          externalId,
          dni,
          cuit,
          email,
          phone,
          phoneE164,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          attributes: dto.attributes == null ? Prisma.JsonNull : (dto.attributes as object),
        } as Prisma.ContactUncheckedCreateInput,
      });
      this.logger.log(`Contact created: ${row.id} in org ${ctx.organizationId}`);
      return row as ContactDto;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un contact con ese externalId, dni o cuit en esta organización',
        );
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateContactDto): Promise<ContactDto> {
    this.requireContext();
    const existing = await this.prisma.scoped.contact.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Contact no encontrado');

    const data: Prisma.ContactUncheckedUpdateInput = {};
    if (dto.externalId !== undefined) data.externalId = normalizeExternalId(dto.externalId);
    if (dto.dni !== undefined) data.dni = this.parseDni(dto.dni);
    if (dto.cuit !== undefined) data.cuit = this.parseCuit(dto.cuit);
    if (dto.email !== undefined) data.email = normalizeEmail(dto.email);
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() ?? null;
    if (dto.phoneE164 !== undefined) data.phoneE164 = normalizePhoneE164(dto.phoneE164);
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.attributes !== undefined) {
      data.attributes = dto.attributes === null ? Prisma.JsonNull : (dto.attributes as object);
    }

    try {
      const row = await this.prisma.scoped.contact.update({ where: { id }, data });
      return row as ContactDto;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un contact con ese externalId, dni o cuit en esta organización',
        );
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

  private parseDni(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined || raw === '') return raw === undefined ? null : null;
    const normalized = normalizeDni(raw);
    if (!normalized) throw new BadRequestException('DNI inválido (debe tener 7 u 8 dígitos)');
    return normalized;
  }

  private parseCuit(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined || raw === '') return raw === undefined ? null : null;
    const normalized = normalizeCuit(raw);
    if (!normalized) throw new BadRequestException('CUIT inválido (checksum mod-11)');
    return normalized;
  }

  private buildListWhere(params: ListContactsQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (params.externalId) where.externalId = params.externalId;
    const dni = params.dni ? normalizeDni(params.dni) : null;
    if (dni) where.dni = dni;
    const cuit = params.cuit ? normalizeCuit(params.cuit) : null;
    if (cuit) where.cuit = cuit;
    const email = params.email ? normalizeEmail(params.email) : null;
    if (email) where.email = email;
    const phoneE164 = params.phone ? normalizePhoneE164(params.phone) : null;
    if (phoneE164) where.phoneE164 = phoneE164;

    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { externalId: { contains: q, mode: 'insensitive' } },
        { phoneE164: { contains: q } },
      ];
    }
    return where;
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}

function clampLimit(raw?: number): number {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_LIMIT);
}
