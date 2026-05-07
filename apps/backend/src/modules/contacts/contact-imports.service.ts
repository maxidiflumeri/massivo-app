import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import {
  normalizeCuit,
  normalizeDni,
  normalizeEmail,
  normalizeExternalId,
  normalizePhoneE164,
} from './identity';
import type {
  CreateContactImportDto,
  ImportContactRowDto,
  ListContactImportsQueryDto,
} from './contact-imports.dto';

interface NormalizedRow {
  index: number;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  attributes: Record<string, unknown> | null;
}

interface RowError {
  index: number;
  message: string;
  row: ImportContactRowDto;
}

interface ContactRow {
  id: string;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phoneE164: string | null;
}

export interface ContactImportJobDto {
  id: string;
  organizationId: string;
  teamId: string | null;
  createdByUserId: string;
  fileName: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED';
  mapping: unknown;
  options: unknown;
  total: number;
  processed: number;
  created: number;
  updated: number;
  suggested: number;
  errors: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface ContactImportJobPage {
  items: ContactImportJobDto[];
  nextCursor: string | null;
}

const DEFAULT_LIST_LIMIT = 25;

@Injectable()
export class ContactImportsService {
  private readonly logger = new Logger(ContactImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContactImportDto): Promise<{ id: string }> {
    const ctx = this.requireContext();

    const job = await this.prisma.scoped.contactImportJob.create({
      data: {
        teamId: ctx.teamId,
        createdByUserId: ctx.userId,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        status: 'PROCESSING',
        mapping: dto.mapping as Prisma.InputJsonValue,
        options: (dto.options ?? null) as Prisma.InputJsonValue | undefined,
        total: dto.rows.length,
        startedAt: new Date(),
      } as Prisma.ContactImportJobUncheckedCreateInput,
    });

    try {
      const result = await this.processRows(dto.rows);
      await this.prisma.scoped.contactImportJob.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          processed: result.processed,
          created: result.created,
          updated: result.updated,
          suggested: result.suggested,
          errors: result.errors.length > 0 ? (result.errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          finishedAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.error(`Import job ${job.id} failed`, e instanceof Error ? e.stack : e);
      await this.prisma.scoped.contactImportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errors: [{ message: (e as Error).message ?? 'unknown' }] as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      throw e;
    }

    return { id: job.id };
  }

  async list(params: ListContactImportsQueryDto): Promise<ContactImportJobPage> {
    this.requireContext();
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : DEFAULT_LIST_LIMIT;

    const rows = (await this.prisma.scoped.contactImportJob.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    })) as ContactImportJobDto[];

    if (rows.length > limit) {
      const items = rows.slice(0, limit);
      return { items, nextCursor: items[items.length - 1]!.id };
    }
    return { items: rows, nextCursor: null };
  }

  async findOne(id: string): Promise<ContactImportJobDto> {
    this.requireContext();
    const row = await this.prisma.scoped.contactImportJob.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Import job no encontrado');
    return row as ContactImportJobDto;
  }

  private async processRows(rows: ImportContactRowDto[]) {
    let processed = 0;
    let created = 0;
    let updated = 0;
    let suggested = 0;
    const errors: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]!;
      try {
        const normalized = this.normalizeRow(raw, i);
        if (!hasAnyIdentifier(normalized)) {
          errors.push({ index: i, message: 'Fila sin identificadores válidos', row: raw });
          continue;
        }
        const outcome = await this.applyRow(normalized);
        if (outcome === 'created') created++;
        else if (outcome === 'updated') updated++;
        else if (outcome === 'suggested') suggested++;
      } catch (e) {
        errors.push({
          index: i,
          message: (e as Error).message ?? 'unknown error',
          row: raw,
        });
      } finally {
        processed++;
      }
    }

    return { processed, created, updated, suggested, errors };
  }

  private normalizeRow(raw: ImportContactRowDto, index: number): NormalizedRow {
    const dni = raw.dni ? normalizeDni(raw.dni) : null;
    if (raw.dni && !dni) throw new Error('DNI inválido');
    const cuit = raw.cuit ? normalizeCuit(raw.cuit) : null;
    if (raw.cuit && !cuit) throw new Error('CUIT inválido');
    const phoneE164 = normalizePhoneE164(raw.phoneE164 ?? raw.phone);
    return {
      index,
      externalId: normalizeExternalId(raw.externalId),
      dni,
      cuit,
      email: normalizeEmail(raw.email),
      phone: raw.phone?.trim() || (phoneE164 ?? null),
      phoneE164,
      firstName: raw.firstName?.trim() || null,
      lastName: raw.lastName?.trim() || null,
      attributes: raw.attributes ?? null,
    };
  }

  private async applyRow(row: NormalizedRow): Promise<'created' | 'updated' | 'suggested'> {
    const strongMatch = await this.findByStrongKey(row);
    if (strongMatch) {
      await this.updateContact(strongMatch.id, row, { skipStrongConflicts: true });
      await this.maybeSuggestWeakConflict(strongMatch, row);
      return 'updated';
    }

    const weakMatch = await this.findByWeakKey(row);
    if (weakMatch) {
      const rowHasStrong = !!(row.externalId || row.dni || row.cuit);
      if (!rowHasStrong) {
        await this.updateContact(weakMatch.id, row, { skipStrongConflicts: false });
        return 'updated';
      }
      const updateOk = await this.tryUpdateContact(weakMatch.id, row);
      if (updateOk) return 'updated';
      const newId = await this.createContact(row);
      await this.upsertSuggestion(weakMatch, { id: newId, ...rowToContactRow(row) }, row);
      return 'suggested';
    }

    await this.createContact(row);
    return 'created';
  }

  private async findByStrongKey(row: NormalizedRow): Promise<ContactRow | null> {
    if (row.externalId) {
      const r = await this.prisma.scoped.contact.findFirst({
        where: { externalId: row.externalId },
        select: contactSelect,
      });
      if (r) return r;
    }
    if (row.dni) {
      const r = await this.prisma.scoped.contact.findFirst({
        where: { dni: row.dni },
        select: contactSelect,
      });
      if (r) return r;
    }
    if (row.cuit) {
      const r = await this.prisma.scoped.contact.findFirst({
        where: { cuit: row.cuit },
        select: contactSelect,
      });
      if (r) return r;
    }
    return null;
  }

  private async findByWeakKey(row: NormalizedRow): Promise<ContactRow | null> {
    if (row.email) {
      const r = await this.prisma.scoped.contact.findFirst({
        where: { email: row.email },
        select: contactSelect,
      });
      if (r) return r;
    }
    if (row.phoneE164) {
      const r = await this.prisma.scoped.contact.findFirst({
        where: { phoneE164: row.phoneE164 },
        select: contactSelect,
      });
      if (r) return r;
    }
    return null;
  }

  private async createContact(row: NormalizedRow): Promise<string> {
    const created = await this.prisma.scoped.contact.create({
      data: {
        externalId: row.externalId,
        dni: row.dni,
        cuit: row.cuit,
        email: row.email,
        phone: row.phone,
        phoneE164: row.phoneE164,
        firstName: row.firstName,
        lastName: row.lastName,
        attributes: row.attributes == null ? Prisma.JsonNull : (row.attributes as object),
      } as Prisma.ContactUncheckedCreateInput,
      select: { id: true },
    });
    return created.id;
  }

  private async updateContact(
    id: string,
    row: NormalizedRow,
    opts: { skipStrongConflicts: boolean },
  ) {
    const data: Prisma.ContactUncheckedUpdateInput = {};
    if (row.externalId !== null) data.externalId = row.externalId;
    if (row.dni !== null) data.dni = row.dni;
    if (row.cuit !== null) data.cuit = row.cuit;
    if (row.email !== null) data.email = row.email;
    if (row.phone !== null) data.phone = row.phone;
    if (row.phoneE164 !== null) data.phoneE164 = row.phoneE164;
    if (row.firstName !== null) data.firstName = row.firstName;
    if (row.lastName !== null) data.lastName = row.lastName;
    if (row.attributes !== null) data.attributes = row.attributes as object;

    try {
      await this.prisma.scoped.contact.update({ where: { id }, data });
    } catch (e) {
      if (
        opts.skipStrongConflicts &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const safe: Prisma.ContactUncheckedUpdateInput = { ...data };
        delete safe.externalId;
        delete safe.dni;
        delete safe.cuit;
        await this.prisma.scoped.contact.update({ where: { id }, data: safe });
        return;
      }
      throw e;
    }
  }

  private async tryUpdateContact(id: string, row: NormalizedRow): Promise<boolean> {
    try {
      await this.updateContact(id, row, { skipStrongConflicts: false });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return false;
      }
      throw e;
    }
  }

  private async maybeSuggestWeakConflict(strongMatch: ContactRow, row: NormalizedRow) {
    if (row.email && row.email !== strongMatch.email) {
      const other = await this.prisma.scoped.contact.findFirst({
        where: { email: row.email, NOT: { id: strongMatch.id } },
        select: contactSelect,
      });
      if (other) {
        await this.upsertSuggestion(strongMatch, other, row, 'EMAIL');
      }
    }
    if (row.phoneE164 && row.phoneE164 !== strongMatch.phoneE164) {
      const other = await this.prisma.scoped.contact.findFirst({
        where: { phoneE164: row.phoneE164, NOT: { id: strongMatch.id } },
        select: contactSelect,
      });
      if (other) {
        await this.upsertSuggestion(strongMatch, other, row, 'PHONE');
      }
    }
  }

  private async upsertSuggestion(
    left: ContactRow,
    right: ContactRow,
    row: NormalizedRow,
    matchType: 'EMAIL' | 'PHONE' = row.email ? 'EMAIL' : 'PHONE',
  ) {
    const matchValue = matchType === 'EMAIL' ? (row.email ?? '') : (row.phoneE164 ?? '');
    if (!matchValue) return;
    const [a, b] = left.id < right.id ? [left.id, right.id] : [right.id, left.id];
    try {
      await this.prisma.scoped.contactMergeSuggestion.create({
        data: {
          leftContactId: a,
          rightContactId: b,
          matchType,
          matchValue,
        } as Prisma.ContactMergeSuggestionUncheckedCreateInput,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return;
      }
      throw e;
    }
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}

const contactSelect = {
  id: true,
  externalId: true,
  dni: true,
  cuit: true,
  email: true,
  phoneE164: true,
} as const;

function hasAnyIdentifier(row: NormalizedRow): boolean {
  return !!(row.externalId || row.dni || row.cuit || row.email || row.phoneE164);
}

function rowToContactRow(row: NormalizedRow): Omit<ContactRow, 'id'> {
  return {
    externalId: row.externalId,
    dni: row.dni,
    cuit: row.cuit,
    email: row.email,
    phoneE164: row.phoneE164,
  };
}
