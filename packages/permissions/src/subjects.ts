export type SubjectName =
  | 'Campaign'
  | 'Contact'
  | 'Template'
  | 'WapiConfig'
  | 'WapiTemplate'
  | 'SmtpAccount'
  | 'Team'
  | 'Organization'
  | 'Member'
  | 'Billing'
  | 'Analytics'
  | 'AiFeature';

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
