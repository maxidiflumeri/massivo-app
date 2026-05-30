export type OrgRole = 'OWNER' | 'ADMIN' | 'BILLING' | 'MEMBER';
export type TeamRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface RequestContext {
  userId: string;
  organizationId: string;
  teamId: string;
  orgRole: OrgRole;
  teamRole: TeamRole;
}

export interface MeUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface MePlan {
  code: string;
  name: string;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
}

export interface MeTeam {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  role: TeamRole;
}

export interface PlanFlags {
  hasAi: boolean;
  canCreateTeam: boolean;
  canSso: boolean;
}

/**
 * 4.O.1 — Feature flags efectivos para la org en el contexto actual. Resultado
 * del AND entre el kill-switch global (env) y los flags persistidos en
 * `Organization.*`. El frontend los usa para gatear UI (sidebar, rutas) y
 * mostrar / ocultar features tipo add-on.
 */
export interface OrgFeatureFlags {
  bot: boolean;
}

export interface MeOrganization {
  id: string;
  clerkOrgId: string;
  name: string;
  slug: string;
  /** 4.P — slug opaco URL-safe para webhooks org-scoped (formato: wbh_<22-24 chars>). */
  webhookSlug: string;
  role: OrgRole;
  plan: MePlan;
  permissions: PlanFlags;
  /** 4.O.1 — feature flags efectivos (env AND per-org). */
  features: OrgFeatureFlags;
  teams: MeTeam[];
}

export interface MeContextResponse {
  user: MeUser;
  organizations: MeOrganization[];
}

/**
 * Snapshot de consumo de la organización activa contra los límites de su plan,
 * más accesos rápidos a la última actividad del usuario (campañas).
 *
 * `limit: null` = ilimitado.
 */
export interface UsageMetricSnapshot {
  used: number;
  limit: number | null;
}

export interface MeUsageLastCampaign {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}

export interface MeUsageResponse {
  /** Plan code para colorear/labelear en UI. */
  planCode: string;
  planName: string;
  /** ISO date — inicio del período facturable actual (mes). */
  periodStart: string;
  periodEnd: string;
  metrics: {
    emails: UsageMetricSnapshot;
    wapiMessages: UsageMetricSnapshot;
    dedicatedDomains: UsageMetricSnapshot;
  };
  lastEmailCampaign: MeUsageLastCampaign | null;
  lastWapiCampaign: MeUsageLastCampaign | null;
}
