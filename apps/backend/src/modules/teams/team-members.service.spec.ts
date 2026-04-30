import { Test } from '@nestjs/testing';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { TeamMembersService } from './team-members.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('TeamMembersService', () => {
  let service: TeamMembersService;
  let prismaMock: {
    team: { findUnique: jest.Mock };
    orgMembership: { findUnique: jest.Mock };
    teamMembership: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };

  const adminCtx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  const teamStub = { id: 'team1', organizationId: 'org1' };

  beforeEach(async () => {
    prismaMock = {
      team: { findUnique: jest.fn().mockResolvedValue(teamStub) },
      orgMembership: { findUnique: jest.fn() },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [TeamMembersService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(TeamMembersService);
  });

  it('lanza ForbiddenException si user no es miembro de la org al agregar', async () => {
    prismaMock.orgMembership.findUnique.mockResolvedValue(null);

    await expect(
      TenantContext.run(adminCtx, () =>
        service.addMember('team1', { userId: 'u2', role: 'MEMBER' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza ConflictException si user ya es miembro del team', async () => {
    prismaMock.orgMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.teamMembership.findUnique.mockResolvedValue({ userId: 'u2', teamId: 'team1' });

    await expect(
      TenantContext.run(adminCtx, () =>
        service.addMember('team1', { userId: 'u2', role: 'MEMBER' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('agrega miembro exitosamente', async () => {
    prismaMock.orgMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prismaMock.teamMembership.findUnique.mockResolvedValue(null);
    const created = { userId: 'u2', teamId: 'team1', role: 'MEMBER', user: { id: 'u2', email: 'b@b.com' } };
    prismaMock.teamMembership.create.mockResolvedValue(created);

    const result = await TenantContext.run(adminCtx, () =>
      service.addMember('team1', { userId: 'u2', role: 'MEMBER' }),
    );
    expect(result.userId).toBe('u2');
  });

  it('no permite remover al último ADMIN', async () => {
    prismaMock.teamMembership.findUnique.mockResolvedValue({ userId: 'u1', role: 'ADMIN' });
    prismaMock.teamMembership.count.mockResolvedValue(1);

    await expect(
      TenantContext.run(adminCtx, () => service.removeMember('team1', 'u1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite remover ADMIN si hay más de uno', async () => {
    prismaMock.teamMembership.findUnique.mockResolvedValue({ userId: 'u1', role: 'ADMIN' });
    prismaMock.teamMembership.count.mockResolvedValue(2);

    await TenantContext.run(adminCtx, () => service.removeMember('team1', 'u1'));
    expect(prismaMock.teamMembership.delete).toHaveBeenCalled();
  });

  it('lanza NotFoundException para team de otra org', async () => {
    prismaMock.team.findUnique.mockResolvedValue({ id: 'team-other', organizationId: 'other-org' });

    await expect(
      TenantContext.run(adminCtx, () => service.findAll('team-other')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
