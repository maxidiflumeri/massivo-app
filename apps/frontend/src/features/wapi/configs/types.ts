export interface WapiConfigListItem {
  id: string;
  name: string | null;
  phoneNumberId: string;
  businessAccountId: string;
  isActive: boolean;
  isTestMode: boolean;
  createdAt: string;
}

export interface WapiConfigDetail extends WapiConfigListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  dailyLimit: number;
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
  dailyLimit?: number;
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
  dailyLimit?: number;
  isActive?: boolean;
  isTestMode?: boolean;
}
