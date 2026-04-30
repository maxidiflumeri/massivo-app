import { ForbiddenException } from '@nestjs/common';
import { AbilityFactory } from './ability.factory';
import { TenantContext } from './tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('AbilityFactory', () => {
  const factory = new AbilityFactory();

  const baseCtx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  it('lanza ForbiddenException si no hay TenantContext', () => {
    expect(() => factory.create({})).toThrow(ForbiddenException);
  });

  it('crea Ability con reglas de ADMIN dentro de TenantContext (plan con AI)', () => {
    const ability = TenantContext.run({ ...baseCtx, teamRole: 'ADMIN' }, () =>
      factory.create({ ai: true, multiTeam: true }),
    );

    expect(ability.can('manage', 'Campaign')).toBe(true);
    expect(ability.can('use', 'AiFeature')).toBe(true);
  });

  it('crea Ability con reglas de MEMBER dentro de TenantContext', () => {
    const ability = TenantContext.run(baseCtx, () =>
      factory.create({ ai: true, multiTeam: true }),
    );

    expect(ability.can('create', 'Campaign')).toBe(true);
    expect(ability.can('delete', 'Campaign')).toBe(false);
  });

  it('aplica plan gates correctamente', () => {
    const ability = TenantContext.run(
      { ...baseCtx, orgRole: 'OWNER', teamRole: 'ADMIN' },
      () => factory.create({ ai: false, multiTeam: false }),
    );

    expect(ability.can('manage', 'Campaign')).toBe(true);
    expect(ability.can('use', 'AiFeature')).toBe(false);
    expect(ability.can('create', 'Team')).toBe(false);
  });

  it('OWNER puede manage Organization de su org', () => {
    const ability = TenantContext.run(
      { ...baseCtx, orgRole: 'OWNER' },
      () => factory.create({}),
    );

    expect(ability.can('manage', 'Organization')).toBe(true);
  });

  it('VIEWER solo puede read', () => {
    const ability = TenantContext.run(
      { ...baseCtx, teamRole: 'VIEWER' },
      () => factory.create({}),
    );

    expect(ability.can('read', 'Campaign')).toBe(true);
    expect(ability.can('create', 'Campaign')).toBe(false);
    expect(ability.can('send', 'Campaign')).toBe(false);
    expect(ability.can('delete', 'Campaign')).toBe(false);
  });
});
