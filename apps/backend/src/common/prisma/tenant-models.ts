export type ScopeKind = 'tenant' | 'org' | 'global';

export const TENANT_SCOPED_MODELS = new Set<string>([
  'SmtpAccount',
  'EmailTemplate',
  'EmailCampaign',
  'EmailContact',
  'EmailReport',
  'EmailEvent',
  'EmailBounce',
  'EmailUnsubscribe',
  // WhatsApp channel (Fase 2.B)
  'WapiConfig',
  'WapiTemplate',
  'WapiCampaign',
  'WapiContact',
  'WapiReport',
  'WapiConversation',
  'WapiMessage',
  'WapiOptOut',
  'WapiQuickReply',
  'WapiResolutionNote',
  'WapiBotSession',
  // Bot como entidad propia (Phase 0a — multi-canal)
  'Bot',
  // Cross-cutting (Fase 2.C)
  'Tag',
  'ContactList',
  'ScheduledTask',
  'TaskExecution',
  'CampaignLog',
]);

export const ORG_SCOPED_MODELS = new Set<string>([
  'Subscription',
  'UsageCounter',
  'AuditLog',
  // Unified contacts (Fase 5)
  'Contact',
  'ContactMergeSuggestion',
  'ContactImportJob',
]);

export function getModelScope(model: string | undefined): ScopeKind {
  if (!model) return 'global';
  if (TENANT_SCOPED_MODELS.has(model)) return 'tenant';
  if (ORG_SCOPED_MODELS.has(model)) return 'org';
  return 'global';
}
