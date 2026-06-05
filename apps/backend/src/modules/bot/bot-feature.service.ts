import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';

/**
 * 4.O.1 — Feature gate del bot. Dos niveles AND:
 *   1. `WAPI_BOT_FEATURE_ENABLED=true` (env, kill-switch global)
 *   2. `Organization.botEnabled = true` (per-org, add-on de plan superior)
 *
 * Si cualquiera está off, todos los endpoints `/wapi/configs/:id/bot*`
 * devuelven 403, el motor de bot ignora inbounds y la UI oculta el item.
 *
 * Pensado como puerta única: webhook, controllers, /me, sidebar y router de
 * 4.O.1 consultan acá. Cachear por org-id sería micro-opt — el lookup es 1
 * SELECT con índice y cada inbound ya hace varios queries.
 */
@Injectable()
export class BotFeatureService {
  private readonly logger = new Logger(BotFeatureService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** True si el kill-switch global está prendido. Cheap, sin DB. */
  isEnvEnabled(): boolean {
    return this.config.get<string>('WAPI_BOT_FEATURE_ENABLED') === 'true';
  }

  /** True si el plan trae `features.bot=true` (preferido) o si la org tiene el
   *  flag legacy `botEnabled=true` como override. Hace 1 SELECT con join al
   *  plan. Usa el cliente raíz (no scoped): la lookup es por orgId explícito
   *  y la tenant-extension no aplica a `Organization`. */
  async isOrgEnabled(organizationId: string): Promise<boolean> {
    const row = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { botEnabled: true, plan: { select: { features: true } } } as never,
    });
    const r = row as unknown as {
      botEnabled?: boolean;
      plan?: { features?: Record<string, unknown> | null };
    } | null;
    if (!r) return false;
    if (r.botEnabled === true) return true; // legacy per-org override
    return r.plan?.features?.bot === true;
  }

  /** AND de env + org. Devuelve false si falta contexto (defensive). */
  async isEnabled(organizationId?: string): Promise<boolean> {
    if (!this.isEnvEnabled()) return false;
    const orgId = organizationId ?? TenantContext.current()?.organizationId;
    if (!orgId) return false;
    return this.isOrgEnabled(orgId);
  }

  /**
   * Lanza ForbiddenException si el feature no está habilitado para el org
   * actual. Usar en controllers vía `BotFeatureGuard`, en services como
   * pre-check explícito.
   */
  async assertEnabled(organizationId?: string): Promise<void> {
    if (!this.isEnvEnabled()) {
      throw new ForbiddenException('Feature de bots deshabilitada (env)');
    }
    const orgId = organizationId ?? TenantContext.current()?.organizationId;
    if (!orgId) {
      throw new ForbiddenException('Sin contexto de organización');
    }
    if (!(await this.isOrgEnabled(orgId))) {
      throw new ForbiddenException('Feature de bots no habilitada para esta organización');
    }
  }
}

/**
 * Guard a aplicar en endpoints del bot (controllers + future router CRUD).
 * Requiere TenantContextGuard antes (lee `organizationId` del request, no
 * del AsyncLocalStorage — el interceptor que monta `TenantContext.run` corre
 * después de los guards).
 */
@Injectable()
export class BotFeatureGuard implements CanActivate {
  constructor(private readonly feature: BotFeatureService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ tenantContext?: { organizationId?: string } }>();
    const orgId = req.tenantContext?.organizationId;
    await this.feature.assertEnabled(orgId);
    return true;
  }
}
