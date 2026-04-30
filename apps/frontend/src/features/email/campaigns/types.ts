export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string | null;
  smtpAccountId: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { contacts: number; reports: number };
}

export interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string | null;
  smtpAccountId: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  template: { id: string; name: string; subject: string } | null;
  smtpAccount: {
    id: string;
    fromEmail: string;
    fromName: string | null;
    provider: string;
  } | null;
  _count: { contacts: number; reports: number };
}

export interface CampaignReport {
  campaignId: string;
  counts: Record<string, number>;
  events: { opens: number; clicks: number; uniqueOpens: number; uniqueClicks: number };
}

export interface CreateCampaignPayload {
  name: string;
  templateId?: string;
  smtpAccountId?: string;
  scheduledAt?: string;
}

export interface UpdateCampaignPayload {
  name?: string;
  templateId?: string | null;
  smtpAccountId?: string | null;
  scheduledAt?: string | null;
}

export interface CampaignContactInput {
  email: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface SmtpAccountListItem {
  id: string;
  provider: string;
  fromEmail: string;
  fromName: string | null;
}

export type EmailReportStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'SUPPRESSED';

export interface CampaignReportRow {
  id: string;
  status: EmailReportStatus;
  sentAt: string | null;
  error: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  smtpMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; email: string; name: string | null };
  _count: { events: number };
}

export interface CampaignReportListResponse {
  items: CampaignReportRow[];
  nextCursor: string | null;
}

export type EmailEventType = 'OPEN' | 'CLICK';

export interface CampaignReportEvent {
  id: string;
  type: EmailEventType;
  occurredAt: string;
  targetUrl: string | null;
  targetDomain: string | null;
  ip: string | null;
  userAgent: string | null;
  deviceFamily: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
}
