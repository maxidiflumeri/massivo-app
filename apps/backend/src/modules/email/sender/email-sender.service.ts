import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailSender, SendEmailInput, SendEmailResult } from './email-sender';
import { SesSender } from './ses-sender';
import { SmtpSender } from './smtp-sender';

interface SmtpAccountForSend {
  id: string;
  teamId: string;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
  fromName: string;
  fromEmail: string;
  provider: string;
  sesConfigSet: string | null;
  /** Default Reply-To per-account. Pisado por `input.replyTo` si el caller lo manda. */
  replyTo: string | null;
}

/**
 * Resuelve el sender apropiado para una SmtpAccount y delega el envío.
 * Cachea el SesSender (compartido) y los SmtpSender por accountId (uno por
 * cuenta porque el transporter mantiene pool TCP).
 */
@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private sesSender: SesSender | null = null;
  private readonly smtpCache = new Map<string, { sender: SmtpSender; key: string }>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Valida la conexión / credenciales de una cuenta sin enviar email.
   * SMTP: handshake + AUTH (transporter.verify de nodemailer).
   * SES: GetAccount (call cheapest del API que requiere credenciales válidas).
   */
  async verifyAccount(account: SmtpAccountForSend): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const sender = this.resolveSender(account);
      if (account.provider === 'ses') {
        await (sender as SesSender).verify();
      } else {
        await (sender as SmtpSender).verify();
      }
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`verifyAccount FAILED ${account.id}: ${error}`);
      // Invalidar cache SMTP (transporter pudo haber quedado en estado raro)
      this.smtpCache.delete(account.id);
      return { ok: false, error };
    }
  }

  async sendForAccount(
    account: SmtpAccountForSend,
    input: Omit<SendEmailInput, 'from' | 'configurationSet'> & { from?: string },
  ): Promise<SendEmailResult> {
    const sender = this.resolveSender(account);
    const from = input.from ?? `"${account.fromName}" <${account.fromEmail}>`;

    let configurationSet: string | undefined;
    if (account.provider === 'ses') {
      const ses = sender as SesSender;
      configurationSet = account.sesConfigSet ?? (await ses.ensureConfigurationSet(account.teamId));
    }

    return sender.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      headers: input.headers,
      configurationSet,
      // Resolución del Reply-To: campaign (input) → account default → undefined
      // (no se setea header, recipient cae al `from`).
      replyTo: input.replyTo ?? account.replyTo ?? undefined,
      attachments: input.attachments,
    });
  }

  private resolveSender(account: SmtpAccountForSend): EmailSender {
    if (account.provider === 'ses') {
      if (!this.sesSender) {
        this.sesSender = new SesSender({
          region: this.config.get<string>('AWS_REGION') ?? 'us-east-1',
          accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY'),
          configSetPrefix:
            this.config.get<string>('SES_CONFIG_SET_PREFIX') ?? 'massivo-team-',
          eventsSnsTopicArn: this.config.get<string>('SES_EVENTS_SNS_TOPIC_ARN') || undefined,
        });
      }
      return this.sesSender;
    }

    // smtp (default): cachear por (host:port:username) para invalidar si cambia
    const key = `${account.host}:${account.port}:${account.username}`;
    const cached = this.smtpCache.get(account.id);
    if (cached && cached.key === key) return cached.sender;

    const sender = new SmtpSender({
      host: account.host,
      port: account.port,
      username: account.username,
      password: account.passwordEnc,
    });
    this.smtpCache.set(account.id, { sender, key });
    return sender;
  }
}
