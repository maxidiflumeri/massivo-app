import { Test } from '@nestjs/testing';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('TeamsService', () => {
  let service: TeamsService;
  let prismaMock: {
    team: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    teamMembership: { create: jest.Mock };
  };

  const ownerCtx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  const memberCtx: RequestContext = {
    userId: 'u2',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(async () => {
    prismaMock = {
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      teamMembership: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(TeamsService);
  });

  it('lanza ForbiddenException sin TenantContext', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OWNER ve todos los teams de la org', async () => {
    const teams = [
      { id: 't1', name: 'General', slug: 'general', isDefault: true, organizationId: 'org1', _count: { memberships: 3 } },
      { id: 't2', name: 'Marketing', slug: 'marketing', isDefault: false, organizationId: 'org1', _count: { memberships: 1 } },
    ];
    prismaMock.team.findMany.mockResolvedValue(teams);

    const result = await TenantContext.run(ownerCtx, () => service.findAll());
    expect(result).toHaveLength(2);
    expect(prismaMock.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1' },
      }),
    );
  });

  it('MEMBER solo ve teams donde es miembro', async () => {
    prismaMock.team.findMany.mockResolvedValue([]);

    await TenantContext.run(memberCtx, () => service.findAll());
    expect(prismaMock.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org1',
          memberships: { some: { userId: 'u2' } },
        },
      }),
    );
  });

  it('crear team con slug duplicado lanza ConflictException', async () => {
    prismaMock.team.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      TenantContext.run(ownerCtx, () =>
        service.create({ name: 'Ventas', slug: 'ventas' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crear team exitosamente auto-asigna al creador como ADMIN', async () => {
    prismaMock.team.findUnique.mockResolvedValue(null); // no duplicate
    const createdTeam = {
      id: 'new-team',
      organizationId: 'org1',
      name: 'Ventas',
      slug: 'ventas',
      isDefault: false,
      _count: { memberships: 0 },
    };
    prismaMock.team.create.mockResolvedValue(createdTeam);

    const result = await TenantContext.run(ownerCtx, () =>
      service.create({ name: 'Ventas', slug: 'ventas' }),
    );

    expect(result.id).toBe('new-team');
    expect(prismaMock.teamMembership.create).toHaveBeenCalledWith({
      data: { userId: 'u1', teamId: 'new-team', role: 'ADMIN' },
    });
  });

  it('no se puede eliminar el team por defecto', async () => {
    prismaMock.team.findUnique.mockResolvedValue({
      id: 't1',
      organizationId: 'org1',
      isDefault: true,
    });

    await expect(
      TenantContext.run(ownerCtx, () => service.remove('t1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('eliminar team de otra org lanza NotFoundException', async () => {
    prismaMock.team.findUnique.mockResolvedValue({
      id: 't1',
      organizationId: 'other-org',
      isDefault: false,
    });

    await expect(
      TenantContext.run(ownerCtx, () => service.remove('t1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('eliminar team no-default exitosamente', async () => {
    prismaMock.team.findUnique.mockResolvedValue({
      id: 't2',
      organizationId: 'org1',
      isDefault: false,
    });

    await TenantContext.run(ownerCtx, () => service.remove('t2'));
    expect(prismaMock.team.delete).toHaveBeenCalledWith({ where: { id: 't2' } });
  });
});
