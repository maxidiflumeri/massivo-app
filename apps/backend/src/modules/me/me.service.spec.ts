import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeService } from './me.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('MeService', () => {
  let service: MeService;
  let prismaMock: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prismaMock = { user: { findUnique: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(MeService);
  });

  it('throws 404 si el usuario no existe localmente', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getContext('clerk-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('mapea user + 2 orgs (una con 2 teams) + roles + plan', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'maxi@example.com',
      name: 'Maxi',
      avatarUrl: 'https://avatar/u1',
      orgMemberships: [
        {
          role: 'OWNER',
          organization: {
            id: 'o1',
            clerkOrgId: 'clerk_o1',
            name: 'Org Uno',
            slug: 'org-uno',
            plan: {
              code: 'FREE',
              name: 'Free',
              features: { multiTeam: false },
              limits: { emailsPerMonth: 1000 },
            },
            teams: [
              {
                id: 't1',
                name: 'General',
                slug: 'general',
                isDefault: true,
                memberships: [{ role: 'ADMIN' }],
              },
              {
                id: 't2',
                name: 'Marketing',
                slug: 'marketing',
                isDefault: false,
                memberships: [{ role: 'MEMBER' }],
              },
              {
                id: 't3',
                name: 'Privado',
                slug: 'privado',
                isDefault: false,
                memberships: [],
              },
            ],
          },
        },
        {
          role: 'MEMBER',
          organization: {
            id: 'o2',
            clerkOrgId: 'clerk_o2',
            name: 'Org Dos',
            slug: 'org-dos',
            plan: { code: 'STARTER', name: 'Starter', features: {}, limits: {} },
            teams: [
              {
                id: 't4',
                name: 'General',
                slug: 'general',
                isDefault: true,
                memberships: [{ role: 'VIEWER' }],
              },
            ],
          },
        },
      ],
    });

    const result = await service.getContext('clerk_u1');

    expect(result.user).toEqual({
      id: 'u1',
      email: 'maxi@example.com',
      name: 'Maxi',
      avatarUrl: 'https://avatar/u1',
    });
    expect(result.organizations).toHaveLength(2);
    expect(result.organizations[0]!.role).toBe('OWNER');
    expect(result.organizations[0]!.teams).toHaveLength(2);
    expect(result.organizations[0]!.teams.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(result.organizations[0]!.teams[0]!.role).toBe('ADMIN');
    expect(result.organizations[1]!.role).toBe('MEMBER');
    expect(result.organizations[1]!.teams[0]!.role).toBe('VIEWER');
    expect(result.permissions).toEqual({});
  });

  it('filtra teams donde el usuario no es miembro', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: null,
      orgMemberships: [
        {
          role: 'ADMIN',
          organization: {
            id: 'o1',
            clerkOrgId: 'clerk_o1',
            name: 'Org',
            slug: 'org',
            plan: { code: 'FREE', name: 'Free', features: {}, limits: {} },
            teams: [
              { id: 't1', name: 'A', slug: 'a', isDefault: true, memberships: [{ role: 'ADMIN' }] },
              { id: 't2', name: 'B', slug: 'b', isDefault: false, memberships: [] },
            ],
          },
        },
      ],
    });

    const result = await service.getContext('clerk_u1');
    expect(result.organizations[0]!.teams).toHaveLength(1);
    expect(result.organizations[0]!.teams[0]!.id).toBe('t1');
  });
});
