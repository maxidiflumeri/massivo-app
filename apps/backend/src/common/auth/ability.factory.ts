import { Injectable, ForbiddenException } from '@nestjs/common';
import { defineAbilityFor, type AppAbility } from '@massivo/permissions';
import { TenantContext } from './tenant-context';

@Injectable()
export class AbilityFactory {
  create(planFeatures: Record<string, unknown>): AppAbility {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para evaluar permisos');
    }
    return defineAbilityFor({
      organizationId: ctx.organizationId,
      teamId: ctx.teamId,
      orgRole: ctx.orgRole,
      teamRole: ctx.teamRole,
      planFeatures,
    });
  }
}
