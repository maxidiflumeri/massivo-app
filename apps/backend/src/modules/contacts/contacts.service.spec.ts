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

  it('findAll sin contexto → ForbiddenException', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne inexistente → NotFoundException', async () => {
    mock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.findOne('x')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rechaza si no se pasa email ni phone', async () => {
    await expect(
      TenantContext.run(tenantA, () => service.create({})),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock['create']).not.toHaveBeenCalled();
  });

  it('create exitoso: confía en la extension para inyectar tenant', async () => {
    mock['create']!.mockResolvedValue({
      id: 'c1',
      email: 'a@b.com',
      phone: null,
      firstName: null,
      lastName: null,
      attributes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await TenantContext.run(tenantA, () => service.create({ email: 'a@b.com' }));

    const args = mock['create']!.mock.calls[0][0];
    expect(args.data.organizationId).toBeUndefined();
    expect(args.data.teamId).toBeUndefined();
    expect(args.data.email).toBe('a@b.com');
  });

  it('create con email duplicado en mismo team → ConflictException', async () => {
    mock['create']!.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );

    await expect(
      TenantContext.run(tenantA, () => service.create({ email: 'dup@x.com' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove de contact ajeno → NotFoundException, no llama delete', async () => {
    mock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.remove('c-otro')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mock['delete']).not.toHaveBeenCalled();
  });
});
