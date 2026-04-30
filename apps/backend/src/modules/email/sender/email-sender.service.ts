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
