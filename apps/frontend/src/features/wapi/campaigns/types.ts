export type WapiCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

export type WapiReportStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'CANCELED';

export interface WapiCampaignListItem {
  id: string;
  name: string;
  status: WapiCampaignStatus;
  templateId: string | null;
  configId: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { contacts: number; reports: number };
}

export interface WapiCampaignDetail {
  id: string;
  name: string;
  status: WapiCampaignStatus;
  templateId: string | null;
  configId: string | null;
  scheduledAt: string | null;
  config: unknown;
  createdAt: string;
  updatedAt: string;
  template: {
    id: string;
    metaName: string;
    language: string;
    category: string | null;
  } | null;
  configRel: {
    id: string;
    name: string;
    phoneNumberId: string;
  } | null;
  _count: { contacts: number; reports: number };
}

export interface WapiCampaignReport {
  campaignId: string;
  counts: Record<WapiReportStatus, number>;
  funnel: { sent: number; delivered: number; read: number; failed: number };
}

export interface CreateWapiCampaignPayload {
  name: string;
  templateId?: string;
  configId?: string;
  scheduledAt?: string;
}

export interface UpdateWapiCampaignPayload {
  name?: string;
  templateId?: string | null;
  configId?: string | null;
  scheduledAt?: string | null;
}

export interface WapiCampaignContactInput {
  phone: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface WapiTemplateListItem {
  id: string;
  metaName: string;
  language: string;
  category: string | null;
  status: string | null;
}

export interface WapiConfigListItem {
  id: string;
  name: string;
  phoneNumberId: string;
}

export interface WapiCampaignReportRow {
  id: string;
  status: WapiReportStatus;
  phone: string;
  metaMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  error: string | null;
  createdAt: string;
  contact: { id: string; phone: string; name: string | null } | null;
}

export interface WapiCampaignReportListResponse {
  items: WapiCampaignReportRow[];
  nextCursor: string | null;
}
