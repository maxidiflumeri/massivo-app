export interface PlanFeatures {
  ai?: boolean;
  multiTeam?: boolean;
  sso?: boolean;
  [key: string]: unknown;
}

export interface PlanFlags {
  hasAi: boolean;
  canCreateTeam: boolean;
  canSso: boolean;
}

export function computePlanFlags(features: Record<string, unknown> | null | undefined): PlanFlags {
  const f = (features ?? {}) as PlanFeatures;
  return {
    hasAi: f.ai === true,
    canCreateTeam: f.multiTeam === true,
    canSso: f.sso === true,
  };
}
