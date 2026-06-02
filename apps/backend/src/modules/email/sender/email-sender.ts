export interface EmailAttachment {
  /** Nombre del archivo como lo verá el destinatario. */
  filename: string;
  /** Contenido binario del adjunto ya descargado. */
  content: Buffer;
  /** MIME type. Si no se especifica, MailComposer lo infiere del filename. */
  contentType?: string;
}

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
  /**
   * Adjuntos al mail. Si está presente y no vacío, el provider construye un
   * MIME multipart con los adjuntos. Para SES se usa Content.Raw via
   * MailComposer de nodemailer. Cap del tamaño total + por adjunto es
   * responsabilidad del caller.
   */
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  messageId: string;
  provider: 'smtp' | 'ses';
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
