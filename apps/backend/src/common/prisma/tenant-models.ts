export type ScopeKind = 'tenant' | 'org' | 'global';

export const TENANT_SCOPED_MODELS = new Set<string>([]);

export const ORG_SCOPED_MODELS = new Set<string>(['Subscription', 'UsageCounter', 'AuditLog']);

export function getModelScope(model: string | undefined): ScopeKind {
  if (!model) return 'global';
  if (TENANT_SCOPED_MODELS.has(model)) return 'tenant';
  if (ORG_SCOPED_MODELS.has(model)) return 'org';
  return 'global';
}
