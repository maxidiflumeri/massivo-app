import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PoliciesGuard } from './policies.guard';
import { AbilityFactory } from './ability.factory';
import type { AppAbility } from '@massivo/permissions';
import type { ExecutionContext } from '@nestjs/common';

function createMockContext(planFeatures?: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ planFeatures }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('PoliciesGuard', () => {
  let guard: PoliciesGuard;
  let reflector: Reflector;
  let abilityFactory: AbilityFactory;
  let mockAbility: AppAbility;

  beforeEach(() => {
    reflector = new Reflector();
    abilityFactory = { create: jest.fn() } as unknown as AbilityFactory;
    guard = new PoliciesGuard(reflector, abilityFactory);

    mockAbility = {
      can: jest.fn().mockReturnValue(true),
    } as unknown as AppAbility;
    (abilityFactory.create as jest.Mock).mockReturnValue(mockAbility);
  });

  it('permite si no hay handlers definidos (endpoint sin @CheckPolicies)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext();

    expect(guard.canActivate(ctx)).toBe(true);
    expect(abilityFactory.create).not.toHaveBeenCalled();
  });

  it('permite si handlers es array vacío', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = createMockContext();

    expect(guard.canActivate(ctx)).toBe(true);
    expect(abilityFactory.create).not.toHaveBeenCalled();
  });

  it('permite si todos los handlers retornan true', () => {
    const handler1 = jest.fn().mockReturnValue(true);
    const handler2 = jest.fn().mockReturnValue(true);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([handler1, handler2]);
    const ctx = createMockContext({ ai: true });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(abilityFactory.create).toHaveBeenCalledWith({ ai: true });
    expect(handler1).toHaveBeenCalledWith(mockAbility);
    expect(handler2).toHaveBeenCalledWith(mockAbility);
  });

  it('lanza ForbiddenException si algún handler retorna false', () => {
    const handler1 = jest.fn().mockReturnValue(true);
    const handler2 = jest.fn().mockReturnValue(false);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([handler1, handler2]);
    const ctx = createMockContext({});

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('pasa planFeatures vacío si no está en el request', () => {
    const handler = jest.fn().mockReturnValue(true);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([handler]);
    const ctx = createMockContext(undefined);

    guard.canActivate(ctx);
    expect(abilityFactory.create).toHaveBeenCalledWith({});
  });
});
