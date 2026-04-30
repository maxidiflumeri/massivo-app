export interface MetricsOverview {
  windowDays: 7 | 30;
  from: string;
  to: string;
  totals: {
    sent: number;
    failed: number;
    bounced: number;
    complained: number;
    suppressed: number;
    pending: number;
  };
  uniqueOpens: number;
  uniqueClicks: number;
  rates: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  topCampaigns: Array<{
    id: string;
    name: string;
    sent: number;
    uniqueOpens: number;
    uniqueClicks: number;
    openRate: number;
    clickRate: number;
  }>;
}
