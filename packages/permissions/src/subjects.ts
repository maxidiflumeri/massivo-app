export type SubjectName =
  | 'Campaign'
  | 'Contact'
  | 'ContactList'
  | 'Tag'
  | 'Template'
  | 'WapiConfig'
  | 'WapiTemplate'
  | 'SmtpAccount'
  | 'EmailSuppression'
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
