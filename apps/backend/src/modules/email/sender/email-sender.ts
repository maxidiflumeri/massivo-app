export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  configurationSet?: string;
  headers?: Record<string, string>;
  /**
   * Si está seteado, se manda como Reply-To en el header del mail. El cliente
   * de mail del destinatario lo usa para "Responder" en vez del `from`. Si
   * null/undefined, no se setea y el cliente cae al `from`.
   */
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: 'smtp' | 'ses';
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
