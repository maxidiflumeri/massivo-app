export type OrgRole = 'OWNER' | 'ADMIN' | 'BILLING' | 'MEMBER';
export type TeamRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface RequestContext {
  userId: string;
  organizationId: string;
  teamId: string;
  orgRole: OrgRole;
  teamRole: TeamRole;
}
