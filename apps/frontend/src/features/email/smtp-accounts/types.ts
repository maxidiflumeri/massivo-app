export type SmtpProvider = 'smtp' | 'ses';

export interface SmtpAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  provider: SmtpProvider;
  sesConfigSet: string | null;
  emailDomainId: string | null;
  replyTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSmtpAccountPayload {
  name: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  fromName: string;
  fromEmail: string;
  provider?: SmtpProvider;
  sesConfigSet?: string;
  emailDomainId?: string;
  /** Pasar "" para desetear en update. */
  replyTo?: string;
}

export type UpdateSmtpAccountPayload = Partial<CreateSmtpAccountPayload>;

export interface SmtpAccountWithVerify {
  account: SmtpAccount;
  verify: { ok: true } | { ok: false; error: string };
}
