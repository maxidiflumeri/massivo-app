import { Test } from '@nestjs/testing';
import { ClerkWebhookService } from './clerk-webhook.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClerkSyncService } from '../../common/clerk/clerk-sync.service';

/**
 * 4.R — Verifica que la race condition entre user.created /
 * organization.created / organizationMembership.created está resuelta:
 * cuando el membership webhook llega antes que sus prerrequisitos, el
 * handler ya no retorna silenciosamente sino que backfillea y crea la
 * membresía igual.
 */
describe('ClerkWebhookService - race condition (self-healing)', () => {
  let service: ClerkWebhookService;
  let prismaMock: {
    organization: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let clerkSyncMock: {
    backfillUser: jest.Mock;
    backfillOrganization: jest.Mock;
    ensureOrgAndTeamMembership: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      organization: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    clerkSyncMock = {
      backfillUser: jest.fn(),
      backfillOrganization: jest.fn(),
      ensureOrgAndTeamMembership: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClerkWebhookService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClerkSyncService, useValue: clerkSyncMock },
      ],
    }).compile();

    service = moduleRef.get(ClerkWebhookService);
  });

  function membershipEvent(role = 'org:member') {
    return {
      type: 'organizationMembership.created',
      data: {
        organization: { id: 'clerk_org_42' },
        public_user_data: { user_id: 'clerk_user_99' },
        role,
      },
    };
  }

  it('camino feliz: user + org ya existen → ensureOrgAndTeamMembership con MEMBER', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-local-42', clerkOrgId: 'clerk_org_42' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-local-99', clerkUserId: 'clerk_user_99' });

    await service.handleOrganizationMembershipCreated(membershipEvent());

    expect(clerkSyncMock.backfillUser).not.toHaveBeenCalled();
    expect(clerkSyncMock.backfillOrganization).not.toHaveBeenCalled();
    expect(clerkSyncMock.ensureOrgAndTeamMembership).toHaveBeenCalledWith(
      'user-local-99',
      'org-local-42',
      'MEMBER',
    );
  });

  it('race: org no existe localmente → la trae del SDK y crea la membership', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-local-99', clerkUserId: 'clerk_user_99' });
    clerkSyncMock.backfillOrganization.mockResolvedValue({ id: 'org-local-42', clerkOrgId: 'clerk_org_42' });

    await service.handleOrganizationMembershipCreated(membershipEvent('org:admin'));

    expect(clerkSyncMock.backfillOrganization).toHaveBeenCalledWith('clerk_org_42');
    expect(clerkSyncMock.ensureOrgAndTeamMembership).toHaveBeenCalledWith(
      'user-local-99',
      'org-local-42',
      'ADMIN',
    );
  });

  it('race: user no existe localmente → lo trae del SDK y crea la membership', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org-local-42', clerkOrgId: 'clerk_org_42' });
    prismaMock.user.findUnique.mockResolvedValue(null);
    clerkSyncMock.backfillUser.mockResolvedValue({ id: 'user-local-99', clerkUserId: 'clerk_user_99' });

    await service.handleOrganizationMembershipCreated(membershipEvent());

    expect(clerkSyncMock.backfillUser).toHaveBeenCalledWith('clerk_user_99');
    expect(clerkSyncMock.ensureOrgAndTeamMembership).toHaveBeenCalledWith(
      'user-local-99',
      'org-local-42',
      'MEMBER',
    );
  });

  it('race: ni user ni org existen → backfillea ambos antes de crear la membership', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    clerkSyncMock.backfillOrganization.mockResolvedValue({ id: 'org-local-42', clerkOrgId: 'clerk_org_42' });
    clerkSyncMock.backfillUser.mockResolvedValue({ id: 'user-local-99', clerkUserId: 'clerk_user_99' });

    await service.handleOrganizationMembershipCreated(membershipEvent('org:billing'));

    expect(clerkSyncMock.backfillOrganization).toHaveBeenCalledWith('clerk_org_42');
    expect(clerkSyncMock.backfillUser).toHaveBeenCalledWith('clerk_user_99');
    expect(clerkSyncMock.ensureOrgAndTeamMembership).toHaveBeenCalledWith(
      'user-local-99',
      'org-local-42',
      'BILLING',
    );
  });

  it('SDK deshabilitado y entidad no encontrada → throw (Svix reintentará)', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-local-99', clerkUserId: 'clerk_user_99' });
    clerkSyncMock.backfillOrganization.mockResolvedValue(null);

    await expect(
      service.handleOrganizationMembershipCreated(membershipEvent()),
    ).rejects.toThrow(/Membership backfill incompleto/);

    expect(clerkSyncMock.ensureOrgAndTeamMembership).not.toHaveBeenCalled();
  });
});
