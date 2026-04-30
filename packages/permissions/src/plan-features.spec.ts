import { computePlanFlags } from './plan-features';

describe('computePlanFlags', () => {
  it('todos los flags en false cuando features está vacío', () => {
    expect(computePlanFlags({})).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
  });

  it('mapea ai/multiTeam/sso → hasAi/canCreateTeam/canSso', () => {
    expect(computePlanFlags({ ai: true, multiTeam: true, sso: true })).toEqual({
      hasAi: true,
      canCreateTeam: true,
      canSso: true,
    });
  });

  it('ignora valores no-boolean true', () => {
    expect(computePlanFlags({ ai: 'yes', multiTeam: 1 })).toEqual({
      hasAi: false,
      canCreateTeam: false,
      canSso: false,
    });
  });

  it('null/undefined → todos false', () => {
    expect(computePlanFlags(null)).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
    expect(computePlanFlags(undefined)).toEqual({ hasAi: false, canCreateTeam: false, canSso: false });
  });
});
