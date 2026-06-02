import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeService } from './me.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClerkSyncService } from '../../common/clerk/clerk-sync.service';

describe('MeService', () => {
  let service: MeService;
  let prismaMock: { user: { findUnique: jest.Mock } };
  let clerkSyncMock: { reconcileUserMemberships: jest.Mock };

  beforeEach(async () => {
    prismaMock = { user: { findUnique: jest.fn() } };
    clerkSyncMock = { reconcileUserMemberships: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: ClerkSyncService, useValue: clerkSyncMock },
      ],
    }).compile();

    service = moduleRef.get(MeService);
  });

  it('throws 404 si el usuario no existe localmente', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getContext('clerk-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('llama a reconcileUserMemberships antes de leer la DB local', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.getContext('clerk-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(clerkSyncMock.reconcileUserMemberships).toHaveBeenCalledWith('clerk-x');
  });

  it('degrada gracefully si reconcile falla (Clerk down) y sigue con data local', async () => {
    clerkSyncMock.reconcileUserMemberships.mockRejectedValueOnce(new Error('clerk timeout'));
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: null, avatarUrl: null, orgMemberships: [],
    });
    const result = await service.getContext('clerk_u1');
    expect(result.organizations).toEqual([]);
    expect(result.user.id).toBe('u1');
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
    expect(result.organizations[0]!.permissions).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
    expect(result.organizations[1]!.role).toBe('MEMBER');
    expect(result.organizations[1]!.teams[0]!.role).toBe('VIEWER');
    expect(result.organizations[1]!.permissions).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
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
    expect(result.organizations[0]!.permissions).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
  });

  it('computa plan flags con features habilitadas', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: null,
      avatarUrl: null,
      orgMemberships: [
        {
          role: 'OWNER',
          organization: {
            id: 'o1',
            clerkOrgId: 'clerk_o1',
            name: 'Enterprise',
            slug: 'enterprise',
            plan: {
              code: 'ENTERPRISE',
              name: 'Enterprise',
              features: { ai: true, multiTeam: true, sso: true },
              limits: {},
            },
            teams: [
              { id: 't1', name: 'General', slug: 'general', isDefault: true, memberships: [{ role: 'ADMIN' }] },
            ],
          },
        },
      ],
    });

    const result = await service.getContext('clerk_u1');
    expect(result.organizations[0]!.permissions).toEqual({ hasAi: true, canCreateTeam: true, canSso: true });
  });
});
