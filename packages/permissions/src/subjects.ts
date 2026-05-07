export type SubjectName =
  | 'Campaign'
  | 'Contact'
  | 'ContactList'
  | 'Tag'
  | 'Template'
  | 'WapiConfig'
  | 'WapiTemplate'
  | 'Conversation'
  | 'QuickReply'
  | 'SmtpAccount'
  | 'EmailSuppression'
  | 'Team'
  | 'Organization'
  | 'Member'
  | 'Billing'
  | 'Analytics'
  | 'AiFeature'
  | 'AuditLog';

export type Subject = SubjectName | 'all';

export type Action =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'send'
  | 'export'
  | 'use';
