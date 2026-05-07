export interface LiveCampaignSummary {
  id: string;
  name: string;
  status: string;
  configId: string;
  configName: string | null;
  templateName: string | null;
  startedAt: string | null;
  total: number;
  totals: {
    PENDING: number;
    SENT: number;
    DELIVERED: number;
    READ: number;
    FAILED: number;
    CANCELED: number;
  };
  throughputLast5min: number;
}

export interface LiveConfigUsage {
  id: string;
  name: string | null;
  phoneNumberId: string;
  dailyLimit: number;
  sentLast24h: number;
  percent: number;
  isTestMode: boolean;
}

export interface LiveInboxSnapshot {
  unassigned: number;
  waiting: number;
  escalatedTotal: number;
  oldestUnassignedAt: string | null;
}

export interface LiveSnapshot {
  campaigns: LiveCampaignSummary[];
  configs: LiveConfigUsage[];
  inbox: LiveInboxSnapshot;
  generatedAt: string;
}
