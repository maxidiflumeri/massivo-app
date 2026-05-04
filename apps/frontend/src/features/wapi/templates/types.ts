export interface WapiTemplateListItem {
  id: string;
  metaName: string;
  category: string;
  language: string;
  status: string;
  createdAt: string;
}

export interface WapiTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WapiTemplateDetail extends WapiTemplateListItem {
  businessAccountId: string;
  components: WapiTemplateComponent[] | null;
  buttonActions: unknown;
  syncedAt: string;
}

export interface WapiSyncSummary {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  pages: number;
}

export interface WapiConfigOption {
  id: string;
  name: string | null;
  phoneNumberId: string;
  businessAccountId: string;
}
