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
