import { Injectable, ForbiddenException } from '@nestjs/common';
import { defineAbilityFor, type AppAbility } from '@massivo/permissions';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from './tenant-context';

@Injectable()
export class AbilityFactory {
  /**
   * Crea una AppAbility para el request actual. Acepta el contexto explícito
   * (como hace PoliciesGuard, que corre antes del TenantContextInterceptor)
   * y cae a TenantContext.current() para callsites que ya están dentro del
   * .run() (servicios, jobs, webhooks).
   */
  create(planFeatures: Record<string, unknown>, ctx?: RequestContext): AppAbility {
    const effective = ctx ?? TenantContext.current();
    if (!effective) {
      throw new ForbiddenException('No hay contexto de tenant para evaluar permisos');
    }
    return defineAbilityFor({
      organizationId: effective.organizationId,
      teamId: effective.teamId,
      orgRole: effective.orgRole,
      teamRole: effective.teamRole,
      planFeatures,
    });
  }
}
