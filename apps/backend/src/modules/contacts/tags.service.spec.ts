import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { TagsService } from './tags.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('TagsService', () => {
  let service: TagsService;
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
      providers: [TagsService, { provide: PrismaService, useValue: { scoped: { tag: mock } } }],
    }).compile();

    service = moduleRef.get(TagsService);
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

  it('create exitoso: no inyecta orgId/teamId manual', async () => {
    mock['create']!.mockResolvedValue({
      id: 't1',
      name: 'VIP',
      color: '#fff',
      createdAt: new Date(),
    });

    await TenantContext.run(tenantA, () => service.create({ name: 'VIP', color: '#fff' }));

    const args = mock['create']!.mock.calls[0][0];
    expect(args.data.organizationId).toBeUndefined();
    expect(args.data.teamId).toBeUndefined();
    expect(args.data.name).toBe('VIP');
  });

  it('create duplicado por nombre → ConflictException', async () => {
    mock['create']!.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6' }),
    );

    await expect(
      TenantContext.run(tenantA, () => service.create({ name: 'VIP' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove tag ajeno → NotFoundException, no llama delete', async () => {
    mock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.remove('tag-otro')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mock['delete']).not.toHaveBeenCalled();
  });
});
