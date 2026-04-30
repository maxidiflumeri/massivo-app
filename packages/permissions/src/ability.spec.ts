import { subject } from '@casl/ability';
import { defineAbilityFor, type AbilityContext } from './ability';

const baseCtx: AbilityContext = {
  organizationId: 'org1',
  teamId: 'team1',
  orgRole: 'MEMBER',
  teamRole: 'MEMBER',
  planFeatures: { ai: true, multiTeam: true },
};

describe('defineAbilityFor', () => {
  it('OWNER puede manage Organization de su org pero no de otra', () => {
    const ability = defineAbilityFor({ ...baseCtx, orgRole: 'OWNER' });
    expect(ability.can('manage', subject('Organization', { id: 'org1' }))).toBe(true);
    expect(ability.can('manage', subject('Organization', { id: 'other' }))).toBe(false);
  });

  it('TeamRole ADMIN puede manage all dentro del team', () => {
    const ability = defineAbilityFor({ ...baseCtx, teamRole: 'ADMIN' });
    expect(ability.can('delete', 'Campaign')).toBe(true);
  });

  it('TeamRole MEMBER puede crear Campaign pero no delete', () => {
    const ability = defineAbilityFor({ ...baseCtx, teamRole: 'MEMBER' });
    expect(ability.can('create', 'Campaign')).toBe(true);
    expect(ability.can('delete', 'Campaign')).toBe(false);
  });

  it('TeamRole VIEWER solo puede read', () => {
    const ability = defineAbilityFor({ ...baseCtx, teamRole: 'VIEWER' });
    expect(ability.can('read', 'Campaign')).toBe(true);
    expect(ability.can('create', 'Campaign')).toBe(false);
    expect(ability.can('send', 'Campaign')).toBe(false);
  });

  it('Plan sin AI niega use AiFeature aún siendo OWNER', () => {
    const ability = defineAbilityFor({
      ...baseCtx,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
      planFeatures: { ai: false, multiTeam: true },
    });
    expect(ability.can('use', 'AiFeature')).toBe(false);
  });

  it('Plan sin multiTeam niega create Team', () => {
    const ability = defineAbilityFor({
      ...baseCtx,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
      planFeatures: { ai: true, multiTeam: false },
    });
    expect(ability.can('create', 'Team')).toBe(false);
  });

  it('BILLING role puede manage Billing pero no Organization', () => {
    const ability = defineAbilityFor({ ...baseCtx, orgRole: 'BILLING' });
    expect(ability.can('manage', 'Billing')).toBe(true);
    expect(ability.can('manage', 'Organization')).toBe(false);
  });
});
