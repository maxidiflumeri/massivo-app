export type UnsubscribeScope = 'GLOBAL' | 'CAMPAIGN';

export interface UnsubscribeRow {
  id: string;
  email: string;
  scope: UnsubscribeScope;
  campaignId: string | null;
  reason: string | null;
  source: string | null;
  createdAt: string;
}

export interface BounceRow {
  id: string;
  email: string | null;
  code: string | null;
  description: string | null;
  occurredAt: string;
}

export interface UnsubscribeListResponse {
  items: UnsubscribeRow[];
  nextCursor: string | null;
}

export interface BounceListResponse {
  items: BounceRow[];
  nextCursor: string | null;
}

export interface CreateUnsubscribePayload {
  email: string;
  scope: UnsubscribeScope;
  campaignId?: string;
  reason?: string;
}
