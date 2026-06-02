import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgRole, TeamRole } from '@massivo/prisma';

/**
 * 4.R — Backfill on-demand de entidades Clerk → DB local.
 *
 * Razón de ser: los webhooks (`user.created`, `organization.created`,
 * `organizationMembership.created`) pueden llegar fuera de orden. Si el
 * handler de membership recibe un evento antes que existan localmente el
 * User u Organization, antes hacíamos `return` silencioso y la membership
 * se perdía — el invitado terminaba con `organizations: []` en /me/context
 * y la UI rompía con `Falta header X-Team-Id`.
 *
 * Este servicio resuelve la race condition haciendo que cada handler sea
 * autosuficiente: si falta una entidad local, la trae del SDK de Clerk
 * y crea el mirror antes de proceder. También lo usa /me/context como
 * safety net por si un webhook nunca llega (outage de Svix, etc).
 */
function generateWebhookSlug(): string {
  return `wbh_${randomBytes(18).toString('base64url')}`;
}

@Injectable()
export class ClerkSyncService {
  private readonly logger = new Logger(ClerkSyncService.name);
  private readonly clerk: ClerkClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    this.clerk = secretKey ? createClerkClient({ secretKey }) : null;
  }

  /**
   * Trae el user de Clerk por id y hace upsert local. Devuelve el row local.
   * Si el SDK está deshabilitado o el user no existe en Clerk, devuelve null.
   * En error transitorio (network, Clerk down) propaga el throw para que
   * Svix reintente el webhook.
   */
  async backfillUser(clerkUserId: string) {
    if (!this.clerk) return null;
    const remote = await this.clerk.users.getUser(clerkUserId);
    if (!remote) return null;
    const email = remote.primaryEmailAddress?.emailAddress ?? remote.emailAddresses[0]?.emailAddress;
    if (!email) {
      this.logger.warn(`Clerk user ${clerkUserId} sin email — no se puede backfillear`);
      return null;
    }
    const name = `${remote.firstName ?? ''} ${remote.lastName ?? ''}`.trim() || null;
    const local = await this.prisma.user.upsert({
      where: { clerkUserId },
      update: { email, name, avatarUrl: remote.imageUrl ?? null },
      create: { clerkUserId, email, name, avatarUrl: remote.imageUrl ?? null },
    });
    this.logger.log(`clerk_backfill entity=user clerkUserId=${clerkUserId} localId=${local.id}`);
    return local;
  }

  /**
   * Trae la org de Clerk por id, hace upsert local y se asegura de que
   * exista un team default "General". Devuelve la org local.
   * Importante: si el plan FREE no existe en la DB local, el upsert falla
   * y propaga el error → Svix reintenta.
   */
  async backfillOrganization(clerkOrgId: string) {
    if (!this.clerk) return null;
    const remote = await this.clerk.organizations.getOrganization({ organizationId: clerkOrgId });
    if (!remote) return null;

    const freePlan = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      throw new Error('No se encontró el plan FREE en la base de datos');
    }

    const local = await this.prisma.organization.upsert({
      where: { clerkOrgId },
      update: { name: remote.name, slug: remote.slug || clerkOrgId },
      create: {
        clerkOrgId,
        name: remote.name,
        slug: remote.slug || clerkOrgId,
        webhookSlug: generateWebhookSlug(),
        planId: freePlan.id,
      },
    });

    const existingDefault = await this.prisma.team.findFirst({
      where: { organizationId: local.id, isDefault: true },
    });
    if (!existingDefault) {
      await this.prisma.team.create({
        data: {
          organizationId: local.id,
          name: 'General',
          slug: 'general',
          isDefault: true,
        },
      });
    }

    this.logger.log(`clerk_backfill entity=organization clerkOrgId=${clerkOrgId} localId=${local.id}`);
    return local;
  }

  /**
   * Upsert idempotente de OrgMembership + TeamMembership en team default.
   * No degrada al OWNER si ya existe. Asume que user + org existen localmente
   * (es decir: el caller hace backfill antes si hace falta).
   */
  async ensureOrgAndTeamMembership(
    userId: string,
    organizationId: string,
    orgRole: OrgRole,
  ): Promise<void> {
    const existing = await this.prisma.orgMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    const finalRole: OrgRole = existing?.role === 'OWNER' ? 'OWNER' : orgRole;

    await this.prisma.orgMembership.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: { role: finalRole },
      create: { userId, organizationId, role: finalRole },
    });

    const defaultTeam = await this.prisma.team.findFirst({
      where: { organizationId, isDefault: true },
    });
    if (defaultTeam) {
      const teamRole: TeamRole = finalRole === 'ADMIN' || finalRole === 'OWNER' ? 'ADMIN' : 'MEMBER';
      await this.prisma.teamMembership.upsert({
        where: { userId_teamId: { userId, teamId: defaultTeam.id } },
        update: {},
        create: { userId, teamId: defaultTeam.id, role: teamRole },
      });
    }
  }

  /**
   * Safety net para /me/context: lista todas las orgs del user en Clerk y
   * crea los mirrors locales faltantes. Se invoca en cada `getContext` —
   * el path feliz es no-op (todas las memberships ya existen) y el caro
   * solo aplica cuando hay un faltante real, lo cual es raro.
   */
  async reconcileUserMemberships(clerkUserId: string): Promise<void> {
    if (!this.clerk) return;
    const localUser = await this.prisma.user.findUnique({ where: { clerkUserId } });
    if (!localUser) return; // si el user no existe local, /me/context devolverá 404 y delega al frontend

    const remote = await this.clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
    if (remote.data.length === 0) return;

    // 1) Identificar memberships faltantes vía un solo query.
    const localOrgs = await this.prisma.organization.findMany({
      where: { clerkOrgId: { in: remote.data.map((m) => m.organization.id) } },
      select: { id: true, clerkOrgId: true },
    });
    const byClerkOrgId = new Map(localOrgs.map((o) => [o.clerkOrgId, o.id]));
    const localMemberships = await this.prisma.orgMembership.findMany({
      where: {
        userId: localUser.id,
        organizationId: { in: localOrgs.map((o) => o.id) },
      },
      select: { organizationId: true },
    });
    const haveMembershipFor = new Set(localMemberships.map((m) => m.organizationId));

    // 2) Para cada membership remota, backfillear lo que falte y crear el link.
    for (const m of remote.data) {
      let orgLocalId = byClerkOrgId.get(m.organization.id);
      if (!orgLocalId) {
        const created = await this.backfillOrganization(m.organization.id);
        if (!created) continue;
        orgLocalId = created.id;
      } else if (haveMembershipFor.has(orgLocalId)) {
        continue; // path feliz: ya está sincronizado
      }
      await this.ensureOrgAndTeamMembership(
        localUser.id,
        orgLocalId,
        this.mapClerkRoleToOrgRole(m.role),
      );
      this.logger.log(
        `clerk_backfill source=me-context entity=orgMembership clerkUserId=${clerkUserId} clerkOrgId=${m.organization.id}`,
      );
    }
  }

  /** Mapea `org:admin` / `org:member` / etc → OrgRole. Mismo criterio que el webhook. */
  mapClerkRoleToOrgRole(clerkRole: string): OrgRole {
    switch (clerkRole) {
      case 'org:admin':
        return 'ADMIN';
      case 'org:billing':
        return 'BILLING';
      default:
        return 'MEMBER';
    }
  }
}
