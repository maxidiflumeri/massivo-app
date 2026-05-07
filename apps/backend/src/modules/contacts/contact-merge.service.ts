import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { ListMergeSuggestionsQueryDto } from './contact-merge.dto';

export interface MergeSuggestionDto {
  id: string;
  organizationId: string;
  leftContactId: string;
  rightContactId: string;
  matchType: 'EMAIL' | 'PHONE';
  matchValue: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  leftContact: ContactSnapshot;
  rightContact: ContactSnapshot;
}

interface ContactSnapshot {
  id: string;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phoneE164: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  attributes: unknown;
  createdAt: Date;
}

export interface MergeSuggestionPage {
  items: MergeSuggestionDto[];
  nextCursor: string | null;
}

export interface MergeAcceptResult {
  mergedContactId: string;
  removedContactId: string;
  relinked: {
    emailContacts: number;
    wapiContacts: number;
    contactTags: number;
    contactListMembers: number;
  };
}

const DEFAULT_LIST_LIMIT = 25;

const contactSnapshotSelect = {
  id: true,
  externalId: true,
  dni: true,
  cuit: true,
  email: true,
  phoneE164: true,
  phone: true,
  firstName: true,
  lastName: true,
  attributes: true,
  createdAt: true,
} as const;

@Injectable()
export class ContactMergeService {
  private readonly logger = new Logger(ContactMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListMergeSuggestionsQueryDto): Promise<MergeSuggestionPage> {
    this.requireContext();
    const limit =
      params.limit && params.limit > 0 ? Math.min(params.limit, 100) : DEFAULT_LIST_LIMIT;
    const status = params.status ?? 'PENDING';

    const rows = await this.prisma.scoped.contactMergeSuggestion.findMany({
      where: { status },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        leftContact: { select: contactSnapshotSelect },
        rightContact: { select: contactSnapshotSelect },
      },
    });

    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      leftContactId: r.leftContactId,
      rightContactId: r.rightContactId,
      matchType: r.matchType as 'EMAIL' | 'PHONE',
      matchValue: r.matchValue,
      status: r.status as 'PENDING' | 'ACCEPTED' | 'REJECTED',
      decidedByUserId: r.decidedByUserId,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      leftContact: r.leftContact as ContactSnapshot,
      rightContact: r.rightContact as ContactSnapshot,
    }));

    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async accept(id: string): Promise<MergeAcceptResult> {
    const ctx = this.requireContext();

    const suggestion = await this.prisma.scoped.contactMergeSuggestion.findFirst({
      where: { id },
      include: {
        leftContact: { select: contactSnapshotSelect },
        rightContact: { select: contactSnapshotSelect },
      },
    });
    if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException(`La sugerencia ya está en estado ${suggestion.status}`);
    }

    const left = suggestion.leftContact;
    const right = suggestion.rightContact;
    const leftId = left.id;
    const rightId = right.id;

    const profilePatch = this.buildProfilePatch(left, right);
    const strongConflicts = this.detectStrongKeyConflicts(left, right);
    if (strongConflicts.length > 0) {
      throw new BadRequestException(
        `No se puede mergear: conflictos en strong keys (${strongConflicts.join(', ')})`,
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      if (Object.keys(profilePatch).length > 0) {
        await tx.contact.update({ where: { id: leftId }, data: profilePatch });
      }

      const [emailCount, wapiCount] = await Promise.all([
        tx.emailContact.updateMany({ where: { contactId: rightId }, data: { contactId: leftId } }),
        tx.wapiContact.updateMany({ where: { contactId: rightId }, data: { contactId: leftId } }),
      ]);

      const leftTagIds = (
        await tx.contactTag.findMany({ where: { contactId: leftId }, select: { tagId: true } })
      ).map((t) => t.tagId);
      if (leftTagIds.length > 0) {
        await tx.contactTag.deleteMany({
          where: { contactId: rightId, tagId: { in: leftTagIds } },
        });
      }
      const tagsRelinked = await tx.contactTag.updateMany({
        where: { contactId: rightId },
        data: { contactId: leftId },
      });

      const leftListIds = (
        await tx.contactListMember.findMany({
          where: { contactId: leftId },
          select: { listId: true },
        })
      ).map((m) => m.listId);
      if (leftListIds.length > 0) {
        await tx.contactListMember.deleteMany({
          where: { contactId: rightId, listId: { in: leftListIds } },
        });
      }
      const listsRelinked = await tx.contactListMember.updateMany({
        where: { contactId: rightId },
        data: { contactId: leftId },
      });

      await tx.contactMergeSuggestion.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          decidedByUserId: ctx.userId,
          decidedAt: new Date(),
        },
      });

      await tx.contact.delete({ where: { id: rightId } });

      this.logger.log(
        `Merge ACCEPTED suggestion=${id} left=${leftId} right=${rightId} email=${emailCount.count} wapi=${wapiCount.count} tags=${tagsRelinked.count} lists=${listsRelinked.count}`,
      );

      return {
        mergedContactId: leftId,
        removedContactId: rightId,
        relinked: {
          emailContacts: emailCount.count,
          wapiContacts: wapiCount.count,
          contactTags: tagsRelinked.count,
          contactListMembers: listsRelinked.count,
        },
      };
    });
  }

  async reject(id: string): Promise<{ id: string; status: 'REJECTED' }> {
    const ctx = this.requireContext();
    const suggestion = await this.prisma.scoped.contactMergeSuggestion.findFirst({ where: { id } });
    if (!suggestion) throw new NotFoundException('Sugerencia no encontrada');
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException(`La sugerencia ya está en estado ${suggestion.status}`);
    }
    await this.prisma.scoped.contactMergeSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedByUserId: ctx.userId,
        decidedAt: new Date(),
      },
    });
    return { id, status: 'REJECTED' };
  }

  private buildProfilePatch(left: ContactSnapshot, right: ContactSnapshot) {
    const patch: Record<string, unknown> = {};
    const fields: Array<keyof ContactSnapshot> = [
      'externalId',
      'dni',
      'cuit',
      'email',
      'phoneE164',
      'phone',
      'firstName',
      'lastName',
      'attributes',
    ];
    for (const f of fields) {
      if (left[f] == null && right[f] != null) {
        patch[f] = right[f];
      }
    }
    return patch;
  }

  private detectStrongKeyConflicts(left: ContactSnapshot, right: ContactSnapshot): string[] {
    const conflicts: string[] = [];
    if (left.externalId && right.externalId && left.externalId !== right.externalId) {
      conflicts.push('externalId');
    }
    if (left.dni && right.dni && left.dni !== right.dni) {
      conflicts.push('dni');
    }
    if (left.cuit && right.cuit && left.cuit !== right.cuit) {
      conflicts.push('cuit');
    }
    return conflicts;
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
