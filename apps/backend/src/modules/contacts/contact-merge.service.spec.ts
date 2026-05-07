import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactMergeService } from './contact-merge.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

const tenantA: RequestContext = {
  userId: 'user-1',
  organizationId: 'org-a',
  teamId: 'team-a1',
  orgRole: 'OWNER',
  teamRole: 'ADMIN',
};

interface ContactRow {
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

const baseContact = (overrides: Partial<ContactRow>): ContactRow => ({
  id: 'c',
  externalId: null,
  dni: null,
  cuit: null,
  email: null,
  phoneE164: null,
  phone: null,
  firstName: null,
  lastName: null,
  attributes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('ContactMergeService', () => {
  let service: ContactMergeService;
  let suggestMock: Record<string, jest.Mock>;
  let contactMock: Record<string, jest.Mock>;
  let emailContactMock: Record<string, jest.Mock>;
  let wapiContactMock: Record<string, jest.Mock>;
  let contactTagMock: Record<string, jest.Mock>;
  let contactListMemberMock: Record<string, jest.Mock>;
  let txMock: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    suggestMock = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    contactMock = {
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    emailContactMock = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    wapiContactMock = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    contactTagMock = {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    contactListMemberMock = {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    txMock = {
      contact: contactMock,
      emailContact: emailContactMock,
      wapiContact: wapiContactMock,
      contactTag: contactTagMock,
      contactListMember: contactListMemberMock,
      contactMergeSuggestion: suggestMock,
    };

    const scoped = {
      contactMergeSuggestion: suggestMock,
      $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactMergeService,
        { provide: PrismaService, useValue: { scoped } },
      ],
    }).compile();
    service = moduleRef.get(ContactMergeService);
  });

  it('list filtra por status PENDING por default + cursor pagination', async () => {
    const fake = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      organizationId: 'org-a',
      leftContactId: 'l',
      rightContactId: 'r',
      matchType: 'EMAIL',
      matchValue: 'foo@bar.com',
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date(),
      leftContact: baseContact({ id: 'l', email: 'foo@bar.com' }),
      rightContact: baseContact({ id: 'r', email: 'foo@bar.com' }),
    }));
    suggestMock['findMany']!.mockResolvedValue(fake);

    const result = await TenantContext.run(tenantA, () => service.list({ limit: 5 }));
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe('s4');
    const args = suggestMock['findMany']!.mock.calls[0][0];
    expect(args.where.status).toBe('PENDING');
  });

  it('accept happy path: relink + delete right + update suggestion ACCEPTED', async () => {
    suggestMock['findFirst']!.mockResolvedValue({
      id: 'sugg-1',
      organizationId: 'org-a',
      leftContactId: 'L',
      rightContactId: 'R',
      matchType: 'EMAIL',
      matchValue: 'foo@bar.com',
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date(),
      leftContact: baseContact({ id: 'L', email: 'foo@bar.com', firstName: 'Maxi' }),
      rightContact: baseContact({ id: 'R', email: 'foo@bar.com', dni: '12345678' }),
    });
    emailContactMock['updateMany']!.mockResolvedValue({ count: 3 });
    wapiContactMock['updateMany']!.mockResolvedValue({ count: 1 });
    contactTagMock['updateMany']!.mockResolvedValue({ count: 2 });
    contactListMemberMock['updateMany']!.mockResolvedValue({ count: 0 });

    const result = await TenantContext.run(tenantA, () => service.accept('sugg-1'));

    expect(result.mergedContactId).toBe('L');
    expect(result.removedContactId).toBe('R');
    expect(result.relinked).toEqual({
      emailContacts: 3,
      wapiContacts: 1,
      contactTags: 2,
      contactListMembers: 0,
    });

    expect(contactMock['update']).toHaveBeenCalledWith({
      where: { id: 'L' },
      data: { dni: '12345678' },
    });
    expect(emailContactMock['updateMany']).toHaveBeenCalledWith({
      where: { contactId: 'R' },
      data: { contactId: 'L' },
    });
    expect(suggestMock['update']).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sugg-1' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
          decidedByUserId: 'user-1',
        }),
      }),
    );
    expect(contactMock['delete']).toHaveBeenCalledWith({ where: { id: 'R' } });
  });

  it('accept: cuando left ya tiene tagId del right → deleteMany duplicates antes de updateMany', async () => {
    suggestMock['findFirst']!.mockResolvedValue({
      id: 'sugg-2',
      organizationId: 'org-a',
      leftContactId: 'L',
      rightContactId: 'R',
      matchType: 'EMAIL',
      matchValue: 'x@y.com',
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date(),
      leftContact: baseContact({ id: 'L', email: 'x@y.com' }),
      rightContact: baseContact({ id: 'R', email: 'x@y.com' }),
    });
    contactTagMock['findMany']!.mockResolvedValue([{ tagId: 't1' }, { tagId: 't2' }]);
    contactListMemberMock['findMany']!.mockResolvedValue([{ listId: 'list-1' }]);

    await TenantContext.run(tenantA, () => service.accept('sugg-2'));

    expect(contactTagMock['deleteMany']).toHaveBeenCalledWith({
      where: { contactId: 'R', tagId: { in: ['t1', 't2'] } },
    });
    expect(contactListMemberMock['deleteMany']).toHaveBeenCalledWith({
      where: { contactId: 'R', listId: { in: ['list-1'] } },
    });
  });

  it('accept rechaza si strong key conflict (dni distinto)', async () => {
    suggestMock['findFirst']!.mockResolvedValue({
      id: 'sugg-3',
      organizationId: 'org-a',
      leftContactId: 'L',
      rightContactId: 'R',
      matchType: 'EMAIL',
      matchValue: 'x@y.com',
      status: 'PENDING',
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date(),
      leftContact: baseContact({ id: 'L', dni: '11111111' }),
      rightContact: baseContact({ id: 'R', dni: '22222222' }),
    });

    await expect(
      TenantContext.run(tenantA, () => service.accept('sugg-3')),
    ).rejects.toThrow(BadRequestException);

    expect(contactMock['delete']).not.toHaveBeenCalled();
  });

  it('accept inexistente → NotFound', async () => {
    suggestMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.accept('x')),
    ).rejects.toThrow(NotFoundException);
  });

  it('accept rechaza si suggestion no está PENDING', async () => {
    suggestMock['findFirst']!.mockResolvedValue({
      id: 'sugg-4',
      organizationId: 'org-a',
      leftContactId: 'L',
      rightContactId: 'R',
      matchType: 'EMAIL',
      matchValue: 'x@y.com',
      status: 'ACCEPTED',
      decidedByUserId: 'u',
      decidedAt: new Date(),
      createdAt: new Date(),
      leftContact: baseContact({ id: 'L' }),
      rightContact: baseContact({ id: 'R' }),
    });
    await expect(
      TenantContext.run(tenantA, () => service.accept('sugg-4')),
    ).rejects.toThrow(BadRequestException);
  });

  it('reject marca REJECTED + decidedByUserId', async () => {
    suggestMock['findFirst']!.mockResolvedValue({
      id: 'sugg-5',
      status: 'PENDING',
    });
    const result = await TenantContext.run(tenantA, () => service.reject('sugg-5'));
    expect(result).toEqual({ id: 'sugg-5', status: 'REJECTED' });
    expect(suggestMock['update']).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sugg-5' },
        data: expect.objectContaining({
          status: 'REJECTED',
          decidedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('reject inexistente → NotFound', async () => {
    suggestMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.reject('x')),
    ).rejects.toThrow(NotFoundException);
  });
});
