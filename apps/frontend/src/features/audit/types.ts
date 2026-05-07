export interface AuditLogActor {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  teamId: string | null;
  createdAt: string;
  actor: AuditLogActor | null;
}

export interface AuditLogListResponse {
  items: AuditLogRow[];
  nextCursor: string | null;
}

export interface AuditLogFilters {
  actorUserId: string;
  resourceType: string;
  resourceId: string;
  action: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: AuditLogFilters = {
  actorUserId: '',
  resourceType: '',
  resourceId: '',
  action: '',
  from: '',
  to: '',
};
