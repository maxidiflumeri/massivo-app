import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { RequestContext } from '@massivo/shared-types';
import { CHECK_POLICIES_KEY, type PolicyHandler } from './check-policies.decorator';
import { AbilityFactory } from './ability.factory';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (handlers.length === 0) return true;

    const request = context.switchToHttp().getRequest<
      Request & { planFeatures?: Record<string, unknown>; tenantContext?: RequestContext }
    >();
    const ability = this.abilityFactory.create(request.planFeatures ?? {}, request.tenantContext);

    const ok = handlers.every((h) => h(ability));
    if (!ok) {
      throw new ForbiddenException('No tenés permisos para esta acción');
    }
    return true;
  }
}
