export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  design: Record<string, unknown>;
  smtpAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  subject: string;
  html: string;
  design: Record<string, unknown>;
  smtpAccountId?: string;
}

export type UpdateTemplatePayload = Partial<CreateTemplatePayload>;

export interface EmailTemplateVariableDef {
  key: string;
  label: string;
  sample: string;
}

export interface EmailTemplateVariablesCatalog {
  base: EmailTemplateVariableDef[];
  custom: { key: string; sample?: string }[];
}

export interface PreviewTemplateResponse {
  subject: string;
  html: string;
}

export interface SendTestTemplateResponse {
  ok: true;
  smtpAccountId: string;
  messageId?: string;
}
