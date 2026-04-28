import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgRole } from '@massivo/prisma';

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleUserCreated(evt: any) {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    const email = email_addresses?.[0]?.email_address;
    if (!email) return;

    await this.prisma.user.upsert({
      where: { clerkUserId: id },
      update: {
        email,
        name: `${first_name || ''} ${last_name || ''}`.trim(),
        avatarUrl: image_url,
      },
      create: {
        clerkUserId: id,
        email,
        name: `${first_name || ''} ${last_name || ''}`.trim(),
        avatarUrl: image_url,
      },
    });
    this.logger.log(`User created/updated: ${id}`);
  }

  async handleUserUpdated(evt: any) {
    return this.handleUserCreated(evt);
  }

  async handleUserDeleted(evt: any) {
    const { id } = evt.data;
    if (!id) return;
    await this.prisma.user.deleteMany({
      where: { clerkUserId: id },
    });
    this.logger.log(`User deleted: ${id}`);
  }

  async handleOrganizationCreated(evt: any) {
    const { id, name, slug, created_by } = evt.data;

    // Obtener plan FREE por defecto
    const freePlan = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      throw new Error('No se encontró el plan FREE en la base de datos');
    }

    const org = await this.prisma.organization.create({
      data: {
        clerkOrgId: id,
        name,
        slug: slug || id,
        planId: freePlan.id,
      },
    });

    // Crear team General
    await this.prisma.team.create({
      data: {
        organizationId: org.id,
        name: 'General',
        slug: 'general',
        isDefault: true,
      },
    });

    this.logger.log(`Organization created: ${id} with General team`);
  }

  async handleOrganizationUpdated(evt: any) {
    const { id, name, slug } = evt.data;
    await this.prisma.organization.updateMany({
      where: { clerkOrgId: id },
      data: { name, slug: slug || id },
    });
    this.logger.log(`Organization updated: ${id}`);
  }

  async handleOrganizationDeleted(evt: any) {
    const { id } = evt.data;
    if (!id) return;
    await this.prisma.organization.deleteMany({
      where: { clerkOrgId: id },
    });
    this.logger.log(`Organization deleted: ${id}`);
  }

  async handleOrganizationMembershipCreated(evt: any) {
    const { organization, public_user_data, role } = evt.data;
    
    // Clerk roles: org:admin, org:member, etc. (ajustar a OrgRole)
    let mappedRole: OrgRole = 'MEMBER';
    if (role === 'org:admin' || role === 'org:owner') mappedRole = 'ADMIN';

    const org = await this.prisma.organization.findUnique({
      where: { clerkOrgId: organization.id },
    });

    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: public_user_data.user_id },
    });

    if (!org || !user) {
      this.logger.warn(`Membership created pero org o user no existe localmente todavia: ${organization.id} - ${public_user_data.user_id}`);
      return;
    }

    await this.prisma.orgMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      update: { role: mappedRole },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: mappedRole,
      },
    });

    // Además asignar al team General por defecto como MEMBER
    const generalTeam = await this.prisma.team.findFirst({
      where: { organizationId: org.id, isDefault: true },
    });

    if (generalTeam) {
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
          role: mappedRole === 'ADMIN' ? 'ADMIN' : 'MEMBER',
        },
      });
    }

    this.logger.log(`Membership created for user ${user.id} in org ${org.id}`);
  }

  async handleOrganizationMembershipUpdated(evt: any) {
    return this.handleOrganizationMembershipCreated(evt);
  }

  async handleOrganizationMembershipDeleted(evt: any) {
    const { organization, public_user_data } = evt.data;

    const org = await this.prisma.organization.findUnique({
      where: { clerkOrgId: organization.id },
    });
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId: public_user_data.user_id },
    });

    if (org && user) {
      await this.prisma.orgMembership.deleteMany({
        where: { userId: user.id, organizationId: org.id },
      });
      // Eliminar también del team membership
      const teams = await this.prisma.team.findMany({ where: { organizationId: org.id } });
      for (const team of teams) {
        await this.prisma.teamMembership.deleteMany({
          where: { userId: user.id, teamId: team.id },
        });
      }
      this.logger.log(`Membership deleted for user ${user.id} in org ${org.id}`);
    }
  }
}
