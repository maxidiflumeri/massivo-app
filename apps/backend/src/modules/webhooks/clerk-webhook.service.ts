import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OrgRole, TeamRole } from '@massivo/prisma';

/** Payload genérico de Clerk webhook — tipado mínimo para evitar `any`. */
interface ClerkWebhookEvent {
  data: Record<string, unknown>;
  type: string;
}

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleUserCreated(evt: ClerkWebhookEvent): Promise<void> {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data as Record<string, unknown>;
    const emails = email_addresses as Array<{ email_address: string }> | undefined;
    const email = emails?.[0]?.email_address;
    if (!email) return;

    await this.prisma.user.upsert({
      where: { clerkUserId: id as string },
      update: {
        email,
        name: `${(first_name as string) || ''} ${(last_name as string) || ''}`.trim() || null,
        avatarUrl: (image_url as string) ?? null,
      },
      create: {
        clerkUserId: id as string,
        email,
        name: `${(first_name as string) || ''} ${(last_name as string) || ''}`.trim() || null,
        avatarUrl: (image_url as string) ?? null,
      },
    });
    this.logger.log(`User created/updated: ${id as string}`);
  }

  async handleUserUpdated(evt: ClerkWebhookEvent): Promise<void> {
    return this.handleUserCreated(evt);
  }

  async handleUserDeleted(evt: ClerkWebhookEvent): Promise<void> {
    const id = evt.data['id'] as string | undefined;
    if (!id) return;
    await this.prisma.user.deleteMany({
      where: { clerkUserId: id },
    });
    this.logger.log(`User deleted: ${id}`);
  }

  async handleOrganizationCreated(evt: ClerkWebhookEvent): Promise<void> {
    const { id, name, slug, created_by } = evt.data as Record<string, unknown>;

    // Obtener plan FREE por defecto
    const freePlan = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      throw new Error('No se encontró el plan FREE en la base de datos');
    }

    // Upsert idempotente (Clerk puede re-enviar webhooks)
    const org = await this.prisma.organization.upsert({
      where: { clerkOrgId: id as string },
      update: {
        name: name as string,
        slug: (slug as string) || (id as string),
      },
      create: {
        clerkOrgId: id as string,
        name: name as string,
        slug: (slug as string) || (id as string),
        planId: freePlan.id,
      },
    });

    // Crear team "General" si no existe (idempotente)
    const existingDefault = await this.prisma.team.findFirst({
      where: { organizationId: org.id, isDefault: true },
    });
    if (!existingDefault) {
      await this.prisma.team.create({
        data: {
          organizationId: org.id,
          name: 'General',
          slug: 'general',
          isDefault: true,
        },
      });
    }

    // Si created_by está presente, asegurar que el creador sea OWNER en la org
    if (created_by) {
      const creator = await this.prisma.user.findUnique({
        where: { clerkUserId: created_by as string },
      });
      if (creator) {
        await this.prisma.orgMembership.upsert({
          where: {
            userId_organizationId: {
              userId: creator.id,
              organizationId: org.id,
            },
          },
          update: { role: 'OWNER' },
          create: {
            userId: creator.id,
            organizationId: org.id,
            role: 'OWNER',
          },
        });

        // Auto-asignar al team General como ADMIN
        const generalTeam = await this.prisma.team.findFirst({
          where: { organizationId: org.id, isDefault: true },
        });
        if (generalTeam) {
          await this.prisma.teamMembership.upsert({
            where: {
              userId_teamId: {
                userId: creator.id,
                teamId: generalTeam.id,
              },
            },
            update: { role: 'ADMIN' },
            create: {
              userId: creator.id,
              teamId: generalTeam.id,
              role: 'ADMIN',
            },
          });
        }
      }
    }

    this.logger.log(`Organization created: ${id as string} with General team`);
  }

  async handleOrganizationUpdated(evt: ClerkWebhookEvent): Promise<void> {
    const { id, name, slug } = evt.data as Record<string, unknown>;
    await this.prisma.organization.updateMany({
      where: { clerkOrgId: id as string },
      data: { name: name as string, slug: (slug as string) || (id as string) },
    });
    this.logger.log(`Organization updated: ${id as string}`);
  }

  async handleOrganizationDeleted(evt: ClerkWebhookEvent): Promise<void> {
    const id = evt.data['id'] as string | undefined;
    if (!id) return;
    await this.prisma.organization.deleteMany({
      where: { clerkOrgId: id },
    });
    this.logger.log(`Organization deleted: ${id}`);
  }

  /**
   * Mapea roles de Clerk a OrgRole de Massivo.
   * Clerk usa: org:admin, org:member. No tiene org:owner ni org:billing built-in.
   * El OWNER se asigna al creator en handleOrganizationCreated.
   */
  private mapClerkRoleToOrgRole(clerkRole: string): OrgRole {
    switch (clerkRole) {
      case 'org:admin': return 'ADMIN';
      case 'org:billing': return 'BILLING';
      default: return 'MEMBER';
    }
  }

  private mapOrgRoleToTeamRole(orgRole: OrgRole): TeamRole {
    return orgRole === 'ADMIN' || orgRole === 'OWNER' ? 'ADMIN' : 'MEMBER';
  }

  async handleOrganizationMembershipCreated(evt: ClerkWebhookEvent): Promise<void> {
    const { organization, public_user_data, role } = evt.data as Record<string, unknown>;
    const orgData = organization as { id: string };
    const userData = public_user_data as { user_id: string };
    const clerkRole = role as string;

    const org = await this.prisma.organization.findUnique({
      where: { clerkOrgId: orgData.id },
    });

    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: userData.user_id },
    });

    if (!org || !user) {
      this.logger.warn(
        `Membership created pero org o user no existe localmente todavía: ${orgData.id} - ${userData.user_id}`,
      );
      return;
    }

    // Si el user ya es OWNER, no degradar su rol por un webhook de membership
    const existingMembership = await this.prisma.orgMembership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    });
    const mappedRole = this.mapClerkRoleToOrgRole(clerkRole);
    const finalRole: OrgRole = existingMembership?.role === 'OWNER' ? 'OWNER' : mappedRole;

    await this.prisma.orgMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      update: { role: finalRole },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: finalRole,
      },
    });

    // Auto-asignar al team General por defecto
    const generalTeam = await this.prisma.team.findFirst({
      where: { organizationId: org.id, isDefault: true },
    });

    if (generalTeam) {
      const teamRole = this.mapOrgRoleToTeamRole(finalRole);
      await this.prisma.teamMembership.upsert({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: generalTeam.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          teamId: generalTeam.id,
          role: teamRole,
        },
      });
    }

    this.logger.log(`Membership created for user ${user.id} in org ${org.id} as ${finalRole}`);
  }

  async handleOrganizationMembershipUpdated(evt: ClerkWebhookEvent): Promise<void> {
    return this.handleOrganizationMembershipCreated(evt);
  }

  async handleOrganizationMembershipDeleted(evt: ClerkWebhookEvent): Promise<void> {
    const { organization, public_user_data } = evt.data as Record<string, unknown>;
    const orgData = organization as { id: string };
    const userData = public_user_data as { user_id: string };

    const org = await this.prisma.organization.findUnique({
      where: { clerkOrgId: orgData.id },
    });
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: userData.user_id },
    });

    if (org && user) {
      // Eliminar de todos los teams de esta org
      const teams = await this.prisma.team.findMany({ where: { organizationId: org.id } });
      for (const team of teams) {
        await this.prisma.teamMembership.deleteMany({
          where: { userId: user.id, teamId: team.id },
        });
      }
      // Luego eliminar membership de la org
      await this.prisma.orgMembership.deleteMany({
        where: { userId: user.id, organizationId: org.id },
      });
      this.logger.log(`Membership deleted for user ${user.id} in org ${org.id}`);
    }
  }
}
