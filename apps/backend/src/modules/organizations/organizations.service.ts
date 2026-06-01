import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';

/** 4.P — slug opaco URL-safe para webhooks. 18 bytes → 24 chars base64url. */
function generateWebhookSlug(): string {
  return `wbh_${randomBytes(18).toString('base64url')}`;
}

/** Clerk usa 0 = sin límite. Mapea -1/null de nuestro JSON a 0 de Clerk. */
function toClerkMaxMembers(rawLimit: unknown): number {
  if (typeof rawLimit !== 'number') return 0;
  if (rawLimit < 0) return 0;
  return rawLimit;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  private readonly clerk: ClerkClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    this.clerk = secretKey ? createClerkClient({ secretKey }) : null;
  }

  /**
   * Regenera el webhookSlug de la org actual. Invalida la URL pública previa
   * de webhooks de WhatsApp; el usuario debe actualizarla en Meta tras rotar.
   */
  async regenerateWebhookSlug(): Promise<{ webhookSlug: string }> {
    const ctx = this.requireContext();
    const newSlug = generateWebhookSlug();

    const updated = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { webhookSlug: newSlug },
      select: { webhookSlug: true },
    });

    this.logger.log(`webhookSlug regenerated for org ${ctx.organizationId}`);
    return { webhookSlug: updated.webhookSlug };
  }

  /**
   * Cambia el plan de la org actual. Valida que la org no tenga más recursos
   * que los que el nuevo plan permite (no auto-elimina nada — devuelve 400).
   * Sincroniza `maxAllowedMemberships` en Clerk para que bloquee invites más
   * allá del límite del nuevo plan.
   */
  async changePlan(
    planCode: string,
  ): Promise<{ plan: { code: string; name: string } }> {
    const ctx = this.requireContext();

    const newPlan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });
    if (!newPlan) {
      throw new NotFoundException(`Plan "${planCode}" no existe`);
    }

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: { plan: true },
    });

    if (org.plan.code === newPlan.code) {
      return { plan: { code: newPlan.code, name: newPlan.name } };
    }

    const newLimits = (newPlan.limits ?? {}) as Record<string, unknown>;
    const errors: string[] = [];

    const newTeamsLimit = toCap(newLimits.teams);
    if (newTeamsLimit !== null) {
      const teamCount = await this.prisma.team.count({
        where: { organizationId: org.id },
      });
      if (teamCount > newTeamsLimit) {
        errors.push(
          `Tu org tiene ${teamCount} teams, el plan ${newPlan.code} permite ${newTeamsLimit}. Borrá los excedentes antes de bajar.`,
        );
      }
    }

    const newDomainsLimit = toCap(newLimits.dedicatedDomains);
    if (newDomainsLimit !== null) {
      const domainCount = await this.prisma.emailDomain.count({
        where: { organizationId: org.id },
      });
      if (domainCount > newDomainsLimit) {
        errors.push(
          `Tu org tiene ${domainCount} dominios verificados, el plan ${newPlan.code} permite ${newDomainsLimit}. Borrá los excedentes antes de bajar.`,
        );
      }
    }

    const newMembersLimit = toCap(newLimits.members);
    if (newMembersLimit !== null) {
      const memberCount = await this.prisma.orgMembership.count({
        where: { organizationId: org.id },
      });
      if (memberCount > newMembersLimit) {
        errors.push(
          `Tu org tiene ${memberCount} miembros, el plan ${newPlan.code} permite ${newMembersLimit}. Quitá miembros antes de bajar.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' • '));
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: { planId: newPlan.id },
    });

    if (this.clerk) {
      try {
        await this.clerk.organizations.updateOrganization(org.clerkOrgId, {
          maxAllowedMemberships: toClerkMaxMembers(newLimits.members),
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo sincronizar maxAllowedMemberships a Clerk para org ${org.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Plan changed for org ${org.id}: ${org.plan.code} → ${newPlan.code}`,
    );
    return { plan: { code: newPlan.code, name: newPlan.name } };
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}

/** -1 / negativo → null (ilimitado, sin cap). Otros → number cap. */
function toCap(raw: unknown): number | null {
  if (typeof raw !== 'number') return null;
  if (raw < 0) return null;
  return raw;
}
