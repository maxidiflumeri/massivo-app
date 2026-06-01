import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailSender, SendEmailInput, SendEmailResult } from './email-sender';

export interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

/**
 * Sender SMTP basado en nodemailer. Cada instancia mantiene un Transporter por
 * (host, port, username) — el caller decide cuándo recrear (tras update de la cuenta).
 */
export class SmtpSender implements EmailSender {
  private readonly logger = new Logger(SmtpSender.name);
  private readonly transporter: Transporter;

  constructor(config: SmtpTransportConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // STARTTLS si port=587, TLS directo si 465, plain si 1025 (Mailpit).
      secure: config.port === 465,
      ignoreTLS: config.port === 1025,
      auth:
        config.username && config.password
          ? { user: config.username, pass: config.password }
          : undefined,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      headers: input.headers,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    this.logger.debug(`smtp send → ${input.to}: ${info.messageId}`);
    return { messageId: info.messageId, provider: 'smtp' };
  }
}
