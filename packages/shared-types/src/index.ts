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

export interface MeOrganization {
  id: string;
  clerkOrgId: string;
  name: string;
  slug: string;
  role: OrgRole;
  plan: MePlan;
  teams: MeTeam[];
}

export interface MeContextResponse {
  user: MeUser;
  organizations: MeOrganization[];
  permissions: Record<string, unknown>;
}
