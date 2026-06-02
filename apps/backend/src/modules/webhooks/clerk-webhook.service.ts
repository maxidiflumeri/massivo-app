import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClerkSyncService } from '../../common/clerk/clerk-sync.service';
import type { OrgRole } from '@massivo/prisma';

/** 4.P: slug opaco URL-safe para webhooks. 18 bytes → 24 chars base64url. */
function generateWebhookSlug(): string {
  return `wbh_${randomBytes(18).toString('base64url')}`;
}

/** Payload genérico de Clerk webhook — tipado mínimo para evitar `any`. */
interface ClerkWebhookEvent {
  data: Record<string, unknown>;
  type: string;
}

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkSync: ClerkSyncService,
  ) {}

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
        webhookSlug: generateWebhookSlug(),
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

    // Si created_by está presente, asegurar que el creador sea OWNER en la org.
    // Self-healing: si el User local todavía no existe (race: organization.created
    // arribó antes que user.created del creator) lo traemos del SDK de Clerk.
    if (created_by) {
      let creator = await this.prisma.user.findUnique({
        where: { clerkUserId: created_by as string },
      });
      if (!creator) {
        creator = await this.clerkSync.backfillUser(created_by as string);
      }
      if (creator) {
        await this.clerkSync.ensureOrgAndTeamMembership(creator.id, org.id, 'OWNER');
      } else {
        // Sin SDK key configurada o user inexistente en Clerk → log y seguimos.
        // No tiramos throw porque el webhook de membership posterior puede recuperar.
        this.logger.warn(
          `organization.created creator ${created_by as string} no encontrado en Clerk — se reconciliará vía /me/context`,
        );
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

  async handleOrganizationMembershipCreated(evt: ClerkWebhookEvent): Promise<void> {
    const { organization, public_user_data, role } = evt.data as Record<string, unknown>;
    const orgData = organization as { id: string };
    const userData = public_user_data as { user_id: string };
    const clerkRole = role as string;

    // Self-healing: si user u org no existen localmente (race condition entre
    // user.created / organization.created / organizationMembership.created),
    // los traemos del SDK de Clerk. Esto elimina la dependencia de orden:
    // el evento ya no se pierde aunque llegue antes que sus prerrequisitos.
    let org = await this.prisma.organization.findUnique({
      where: { clerkOrgId: orgData.id },
    });
    if (!org) org = await this.clerkSync.backfillOrganization(orgData.id);

    let user = await this.prisma.user.findUnique({
      where: { clerkUserId: userData.user_id },
    });
    if (!user) user = await this.clerkSync.backfillUser(userData.user_id);

    if (!org || !user) {
      // SDK deshabilitado o entidad inexistente en Clerk (caso muy raro).
      // Tiramos throw para que Svix reintente con backoff.
      throw new Error(
        `Membership backfill incompleto: clerkOrg=${orgData.id} clerkUser=${userData.user_id} — SDK no configurado o entidad inexistente`,
      );
    }

    const mappedRole = this.mapClerkRoleToOrgRole(clerkRole);
    await this.clerkSync.ensureOrgAndTeamMembership(user.id, org.id, mappedRole);

    this.logger.log(`Membership created for user ${user.id} in org ${org.id} as ${mappedRole}`);
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
