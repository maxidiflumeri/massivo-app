import { ForbiddenException, Injectable } from '@nestjs/common';
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

export interface ContactUpsertInput {
  externalId?: string | null;
  dni?: string | null;
  cuit?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneE164?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  attributes?: Record<string, unknown> | null;
}

export type ContactUpsertOutcome = 'created' | 'updated' | 'suggested';

export interface ContactUpsertResult {
  contactId: string;
  outcome: ContactUpsertOutcome;
}

interface NormalizedRow {
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

interface ContactRow {
  id: string;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phoneE164: string | null;
}

const contactSelect = {
  id: true,
  externalId: true,
  dni: true,
  cuit: true,
  email: true,
  phoneE164: true,
} as const;

@Injectable()
export class ContactUpsertService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: ContactUpsertInput): Promise<ContactUpsertResult> {
    this.requireContext();
    const row = this.normalize(input);

    const strongMatch = await this.findByStrongKey(row);
    if (strongMatch) {
      await this.updateContact(strongMatch.id, row, { skipStrongConflicts: true });
      await this.maybeSuggestWeakConflict(strongMatch, row);
      return { contactId: strongMatch.id, outcome: 'updated' };
    }

    const weakMatch = await this.findByWeakKey(row);
    if (weakMatch) {
      const rowHasStrong = !!(row.externalId || row.dni || row.cuit);
      if (!rowHasStrong) {
        await this.updateContact(weakMatch.id, row, { skipStrongConflicts: false });
        return { contactId: weakMatch.id, outcome: 'updated' };
      }
      const updateOk = await this.tryUpdateContact(weakMatch.id, row);
      if (updateOk) return { contactId: weakMatch.id, outcome: 'updated' };
      const newId = await this.createContact(row);
      await this.upsertSuggestion(weakMatch, { id: newId, ...rowToContactRow(row) }, row);
      return { contactId: newId, outcome: 'suggested' };
    }

    const id = await this.createContact(row);
    return { contactId: id, outcome: 'created' };
  }

  private normalize(raw: ContactUpsertInput): NormalizedRow {
    const dni = raw.dni ? normalizeDni(raw.dni) : null;
    if (raw.dni && !dni) throw new Error('DNI inválido');
    const cuit = raw.cuit ? normalizeCuit(raw.cuit) : null;
    if (raw.cuit && !cuit) throw new Error('CUIT inválido');
    const phoneE164 = normalizePhoneE164(raw.phoneE164 ?? raw.phone);
    return {
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
  ): Promise<void> {
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

  private async maybeSuggestWeakConflict(
    strongMatch: ContactRow,
    row: NormalizedRow,
  ): Promise<void> {
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
  ): Promise<void> {
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

  private requireContext(): void {
    if (!TenantContext.current()) {
      throw new ForbiddenException('No hay contexto de tenant');
    }
  }
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
