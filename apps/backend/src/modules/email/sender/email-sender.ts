export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  configurationSet?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  messageId: string;
  provider: 'smtp' | 'ses';
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
