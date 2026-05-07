import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('ContactsService', () => {
  let service: ContactsService;
  let mock: Record<string, jest.Mock>;

  const tenantA: RequestContext = {
    userId: 'user-a',
    organizationId: 'org-a',
    teamId: 'team-a1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    mock = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: { scoped: { contact: mock } } },
      ],
    }).compile();

    service = moduleRef.get(ContactsService);
  });

  describe('access control', () => {
    it('list sin contexto → ForbiddenException', async () => {
      await expect(service.list({})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('findOne sin contexto → ForbiddenException', async () => {
      await expect(service.findOne('x')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('list', () => {
    it('retorna page vacío cuando no hay rows', async () => {
      mock['findMany']!.mockResolvedValue([]);
      const result = await TenantContext.run(tenantA, () => service.list({}));
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it('clamp limit a [1, 200] y default 50', async () => {
      mock['findMany']!.mockResolvedValue([]);

      await TenantContext.run(tenantA, () => service.list({}));
      expect(mock['findMany']!.mock.calls[0][0].take).toBe(51);

      await TenantContext.run(tenantA, () => service.list({ limit: 999 }));
      expect(mock['findMany']!.mock.calls[1][0].take).toBe(201);

      await TenantContext.run(tenantA, () => service.list({ limit: 0 }));
      expect(mock['findMany']!.mock.calls[2][0].take).toBe(51);
    });

    it('cursor pagination: rows.length > limit → nextCursor del último item del slice', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => makeContact(`c${i}`));
      mock['findMany']!.mockResolvedValue(rows);
      const result = await TenantContext.run(tenantA, () =>
        service.list({ limit: 5 }),
      );
      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBe('c4');
    });

    it('cursor en la query → cursor + skip:1 a Prisma', async () => {
      mock['findMany']!.mockResolvedValue([]);
      await TenantContext.run(tenantA, () => service.list({ cursor: 'abc' }));
      const args = mock['findMany']!.mock.calls[0][0];
      expect(args.cursor).toEqual({ id: 'abc' });
      expect(args.skip).toBe(1);
    });

    it('q construye OR contra firstName/lastName/email/externalId/phoneE164', async () => {
      mock['findMany']!.mockResolvedValue([]);
      await TenantContext.run(tenantA, () => service.list({ q: 'maxi' }));
      const where = mock['findMany']!.mock.calls[0][0].where as { OR: unknown[] };
      expect(where.OR).toHaveLength(5);
    });

    it('filtros normalizan: dni acepta separadores, email lowercases', async () => {
      mock['findMany']!.mockResolvedValue([]);
      await TenantContext.run(tenantA, () =>
        service.list({ dni: '12.345.678', email: 'FOO@BAR.COM' }),
      );
      const where = mock['findMany']!.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.dni).toBe('12345678');
      expect(where.email).toBe('foo@bar.com');
    });
  });

  describe('findByIdentity', () => {
    it('cascada externalId → dni → cuit → email → phone, devuelve la primera coincidencia', async () => {
      const c = makeContact('c1');
      mock['findFirst']!
        .mockResolvedValueOnce(null) // externalId miss
        .mockResolvedValueOnce(c); // dni hit
      const result = await TenantContext.run(tenantA, () =>
        service.findByIdentity({ externalId: 'EMP-001', dni: '12345678' }),
      );
      expect(result?.id).toBe('c1');
      expect(mock['findFirst']!).toHaveBeenCalledTimes(2);
    });

    it('todos los campos null → null sin tocar Prisma', async () => {
      const result = await TenantContext.run(tenantA, () => service.findByIdentity({}));
      expect(result).toBeNull();
      expect(mock['findFirst']!).not.toHaveBeenCalled();
    });

    it('descarta dni inválido sin consultar', async () => {
      const result = await TenantContext.run(tenantA, () =>
        service.findByIdentity({ dni: '123' }),
      );
      expect(result).toBeNull();
      expect(mock['findFirst']!).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rechaza si no hay ningún identifier', async () => {
      await expect(
        TenantContext.run(tenantA, () => service.create({})),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mock['create']).not.toHaveBeenCalled();
    });

    it('normaliza dni y phoneE164 antes de persistir', async () => {
      mock['create']!.mockResolvedValue(makeContact('c1'));
      await TenantContext.run(tenantA, () =>
        service.create({ dni: '12.345.678', phone: '+54 911 5577 5452' }),
      );
      const data = mock['create']!.mock.calls[0][0].data;
      expect(data.dni).toBe('12345678');
      expect(data.phoneE164).toBe('+5491155775452');
    });

    it('CUIT inválido → BadRequestException', async () => {
      await expect(
        TenantContext.run(tenantA, () => service.create({ cuit: '20-12345678-9' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confía en la extension para inyectar organizationId', async () => {
      mock['create']!.mockResolvedValue(makeContact('c1'));
      await TenantContext.run(tenantA, () => service.create({ email: 'a@b.com' }));
      const data = mock['create']!.mock.calls[0][0].data;
      expect(data.organizationId).toBeUndefined();
      expect(data.email).toBe('a@b.com');
    });

    it('P2002 (strong key duplicado) → ConflictException', async () => {
      mock['create']!.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );
      await expect(
        TenantContext.run(tenantA, () => service.create({ externalId: 'EMP-1' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('contact ajeno → NotFoundException', async () => {
      mock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.update('x', { firstName: 'Maxi' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('aplica solo los campos presentes en el DTO (no pisa con undefined)', async () => {
      mock['findFirst']!.mockResolvedValue(makeContact('c1'));
      mock['update']!.mockResolvedValue(makeContact('c1'));
      await TenantContext.run(tenantA, () =>
        service.update('c1', { firstName: 'Maxi' }),
      );
      const data = mock['update']!.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['firstName']);
    });
  });

  describe('remove', () => {
    it('contact ajeno → NotFoundException, no llama delete', async () => {
      mock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.remove('c-otro')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mock['delete']).not.toHaveBeenCalled();
    });
  });
});

function makeContact(id: string) {
  return {
    id,
    organizationId: 'org-a',
    teamId: null,
    externalId: null,
    dni: null,
    cuit: null,
    email: null,
    phone: null,
    phoneE164: null,
    firstName: null,
    lastName: null,
    attributes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
