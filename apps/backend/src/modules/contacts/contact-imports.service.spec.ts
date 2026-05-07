import { Test } from '@nestjs/testing';
import { Prisma } from '@massivo/prisma';
import { ContactImportsService } from './contact-imports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('ContactImportsService', () => {
  let service: ContactImportsService;
  let contactMock: Record<string, jest.Mock>;
  let jobMock: Record<string, jest.Mock>;
  let suggestMock: Record<string, jest.Mock>;

  const tenantA: RequestContext = {
    userId: 'user-1',
    organizationId: 'org-a',
    teamId: 'team-a1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    contactMock = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    };
    jobMock = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jest.fn().mockResolvedValue({}),
    };
    suggestMock = {
      create: jest.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactImportsService,
        {
          provide: PrismaService,
          useValue: {
            scoped: {
              contact: contactMock,
              contactImportJob: jobMock,
              contactMergeSuggestion: suggestMock,
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(ContactImportsService);
  });

  it('crea contact nuevo cuando no hay match (counters.created)', async () => {
    contactMock['findFirst']!.mockResolvedValue(null);
    contactMock['create']!.mockResolvedValue({ id: 'c-new' });

    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: { email: 'Email' },
        rows: [{ email: 'foo@bar.com', firstName: 'Maxi' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe('DONE');
    expect(finalUpdate.data.created).toBe(1);
    expect(finalUpdate.data.updated).toBe(0);
    expect(finalUpdate.data.suggested).toBe(0);
    expect(contactMock['create']).toHaveBeenCalledTimes(1);
  });

  it('strong match (externalId) → update sin crear, counters.updated', async () => {
    contactMock['findFirst']!.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.externalId === 'EMP-1') {
        return Promise.resolve({
          id: 'c-existing',
          externalId: 'EMP-1',
          dni: null,
          cuit: null,
          email: null,
          phoneE164: null,
        });
      }
      return Promise.resolve(null);
    });
    contactMock['update']!.mockResolvedValue({});

    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: {},
        rows: [{ externalId: 'EMP-1', firstName: 'Maxi', email: 'new@x.com' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.created).toBe(0);
    expect(finalUpdate.data.updated).toBe(1);
    expect(contactMock['update']).toHaveBeenCalled();
    expect(contactMock['create']).not.toHaveBeenCalled();
  });

  it('weak match (email) sin strong key en row → update', async () => {
    contactMock['findFirst']!.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.email === 'foo@bar.com') {
        return Promise.resolve({
          id: 'c-weak',
          externalId: null,
          dni: null,
          cuit: null,
          email: 'foo@bar.com',
          phoneE164: null,
        });
      }
      return Promise.resolve(null);
    });
    contactMock['update']!.mockResolvedValue({});

    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: {},
        rows: [{ email: 'foo@bar.com', firstName: 'Maxi' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.updated).toBe(1);
    expect(finalUpdate.data.suggested).toBe(0);
  });

  it('weak match + row trae strong key con conflicto P2002 → crea contact + suggestion (counters.suggested)', async () => {
    contactMock['findFirst']!.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.externalId === 'EMP-X') return Promise.resolve(null);
      if (where.email === 'foo@bar.com') {
        return Promise.resolve({
          id: 'c-weak',
          externalId: null,
          dni: null,
          cuit: null,
          email: 'foo@bar.com',
          phoneE164: null,
        });
      }
      return Promise.resolve(null);
    });
    contactMock['update']!.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6' }),
    );
    contactMock['create']!.mockResolvedValue({ id: 'c-new' });

    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: {},
        rows: [{ externalId: 'EMP-X', email: 'foo@bar.com' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.suggested).toBe(1);
    expect(contactMock['create']).toHaveBeenCalled();
    expect(suggestMock['create']).toHaveBeenCalled();
    const args = suggestMock['create']!.mock.calls[0][0].data;
    expect(args.matchType).toBe('EMAIL');
    expect(args.matchValue).toBe('foo@bar.com');
  });

  it('row sin identificadores válidos → error en errors[], no crea/actualiza', async () => {
    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: {},
        rows: [{ firstName: 'Solo Nombre' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.created).toBe(0);
    expect(finalUpdate.data.updated).toBe(0);
    expect(finalUpdate.data.processed).toBe(1);
    expect(finalUpdate.data.errors).toBeDefined();
    expect(Array.isArray(finalUpdate.data.errors)).toBe(true);
    expect(finalUpdate.data.errors).toHaveLength(1);
    expect(contactMock['create']).not.toHaveBeenCalled();
  });

  it('DNI inválido en row → error pero sigue procesando otras filas', async () => {
    contactMock['findFirst']!.mockResolvedValue(null);
    contactMock['create']!.mockResolvedValue({ id: 'c-new' });

    await TenantContext.run(tenantA, () =>
      service.create({
        fileName: 'a.csv',
        fileSize: 100,
        mapping: {},
        rows: [{ dni: '123' }, { email: 'ok@x.com' }],
      }),
    );

    const finalUpdate = jobMock['update']!.mock.calls.at(-1)![0];
    expect(finalUpdate.data.processed).toBe(2);
    expect(finalUpdate.data.created).toBe(1);
    expect(finalUpdate.data.errors).toHaveLength(1);
  });

  it('list con cursor pagination devuelve nextCursor cuando rows > limit', async () => {
    const fake = Array.from({ length: 6 }, (_, i) => ({ id: `j${i}`, createdAt: new Date() }));
    jobMock['findMany']!.mockResolvedValue(fake);
    const result = await TenantContext.run(tenantA, () => service.list({ limit: 5 }));
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe('j4');
  });

  it('findOne inexistente → NotFound', async () => {
    jobMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.findOne('x')),
    ).rejects.toThrow();
  });
});
