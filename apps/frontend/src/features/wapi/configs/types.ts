export interface WapiConfigListItem {
  id: string;
  name: string | null;
  phoneNumberId: string;
  businessAccountId: string;
  isActive: boolean;
  isTestMode: boolean;
  createdAt: string;
  /** Phase 0b (multi-canal): bot conectado a este canal (null si ninguno). */
  botId: string | null;
  /** Fase 1 (multi-canal): tipo de canal (WHATSAPP/INSTAGRAM/…). */
  kind: string;
}

export interface WapiConfigDetail extends WapiConfigListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  optOutKeywords: string[];
  dailyLimit: number;
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
  updatedAt: string;
}

export interface CreateWapiConfigPayload {
  name?: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret?: string;
  welcomeMessage?: string;
  optOutConfirmMessage?: string;
  optOutKeywords?: string[];
  dailyLimit?: number;
  sendDelayMinMs?: number;
  sendDelayMaxMs?: number;
  isTestMode?: boolean;
}

export interface UpdateWapiConfigPayload {
  name?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string | null;
  welcomeMessage?: string | null;
  optOutConfirmMessage?: string | null;
  optOutKeywords?: string[];
  dailyLimit?: number;
  sendDelayMinMs?: number;
  sendDelayMaxMs?: number;
  isActive?: boolean;
  isTestMode?: boolean;
}
