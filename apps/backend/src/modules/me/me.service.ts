import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClerkSyncService } from '../../common/clerk/clerk-sync.service';
import { MeContextResponse } from '@massivo/shared-types';
import { computePlanFlags } from '@massivo/permissions';

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clerkSync: ClerkSyncService,
  ) {}

  /**
   * Safety net 4.R: incluso si los webhooks de Clerk fallaron (race o outage
   * de Svix), reconciliamos contra el SDK antes de armar la respuesta. El
   * path feliz es no-op (todas las memberships ya están sincronizadas); el
   * costo real solo aplica cuando hay un faltante, lo cual es muy raro.
   * No tiramos errores hacia el frontend si Clerk está down — la sesión se
   * abrió con el JWT, así que el user es válido; degradamos a "lo que
   * tengamos local".
   */
  async getContext(clerkUserId: string): Promise<MeContextResponse> {
    try {
      await this.clerkSync.reconcileUserMemberships(clerkUserId);
    } catch (err) {
      this.logger.warn(
        `reconcileUserMemberships falló para clerkUserId=${clerkUserId}, sigo con la data local: ${(err as Error).message}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
      include: {
        orgMemberships: {
          include: {
            organization: {
              include: {
                plan: true,
                teams: {
                  include: {
                    memberships: { where: { user: { clerkUserId } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado en la base local. Si te acabás de registrar, esperá a que se procese el webhook de Clerk y reintentá.',
      );
    }

    const botEnvOn = this.config.get<string>('WAPI_BOT_FEATURE_ENABLED') === 'true';
    const organizations = user.orgMemberships.map((membership) => {
      const org = membership.organization;
      // 4.O.1 — feature flags efectivos: el plan manda; el env es solo el
      // kill-switch global de emergencia.
      const planBot = (org.plan.features as Record<string, unknown> | null)?.bot === true;
      const teams = org.teams
        .filter((team) => team.memberships.length > 0)
        .map((team) => {
          const teamMembership = team.memberships[0];
          return {
            id: team.id,
            name: team.name,
            slug: team.slug,
            isDefault: team.isDefault,
            role: teamMembership!.role,
          };
        });

      return {
        id: org.id,
        clerkOrgId: org.clerkOrgId,
        name: org.name,
        slug: org.slug,
        webhookSlug: org.webhookSlug,
        role: membership.role,
        plan: {
          code: org.plan.code,
          name: org.plan.name,
          features: org.plan.features as Record<string, unknown>,
          limits: org.plan.limits as Record<string, unknown>,
        },
        permissions: computePlanFlags(org.plan.features as Record<string, unknown> | null),
        features: {
          bot: botEnvOn && planBot,
        },
        teams,
      };
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      organizations,
    };
  }
}
