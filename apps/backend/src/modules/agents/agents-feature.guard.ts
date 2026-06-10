import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Feature gate de Agentes IA por plan: requiere `Plan.features.ai === true`
 * (FREE no lo trae; STARTER+ sí). Mismo criterio que `BotFeatureGuard` pero sin
 * kill-switch de env. Requiere TenantContextGuard antes (lee `organizationId`
 * del request, no del AsyncLocalStorage — el interceptor corre después).
 * Usa el cliente raíz: la lookup es por orgId explícito y la tenant-extension
 * no aplica a `Organization`.
 */
@Injectable()
export class AgentsFeatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ tenantContext?: { organizationId?: string } }>();
    const orgId = req.tenantContext?.organizationId;
    if (!orgId) throw new ForbiddenException('Sin contexto de organización');

    const row = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: { select: { features: true } } } as never,
    });
    const features = (
      row as unknown as { plan?: { features?: Record<string, unknown> | null } } | null
    )?.plan?.features;
    if (features?.ai !== true) {
      throw new ForbiddenException(
        'Los agentes IA no están incluidos en tu plan. Subí de plan para usarlos.',
      );
    }
    return true;
  }
}
