import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import Handlebars from 'handlebars';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailSenderService } from '../sender/email-sender.service';
import { SuppressionService } from '../suppression/suppression.service';
import { prepareHtmlForTracking } from '../tracking/prepare-html';
import { TrackingTokenService } from '../tracking/tracking-token.service';
import { EMAIL_QUEUE_NAME, type EmailSendJob } from './email-queue.types';

/**
 * Procesa jobs email-send. Para cada job:
 *  1. Reconstruye TenantContext (orgId+teamId del payload, role sintético OWNER/ADMIN
 *     porque el envío es background sin user real — la authz ya pasó al enquolar).
 *  2. Carga EmailReport + Contact + Campaign + Template + SmtpAccount via prisma.scoped.
 *  3. Renderiza HTML con handlebars usando contact.data como vars.
 *  4. Envía via EmailSenderService (smtp/ses según account.provider).
 *  5. Marca report SENT con messageId; FAILED si tira.
 */
@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private worker: Worker<EmailSendJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly senders: EmailSenderService,
    private readonly tokens: TrackingTokenService,
    private readonly suppression: SuppressionService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('EMAIL_WORKER_ENABLED') === 'false') {
      this.logger.warn('Email worker disabled via EMAIL_WORKER_ENABLED=false');
      return;
    }
    const queueName = this.config.get<string>('EMAIL_QUEUE_NAME') ?? EMAIL_QUEUE_NAME;
    const concurrency = Number(this.config.get<string>('EMAIL_WORKER_CONCURRENCY') ?? 5);

    this.worker = new Worker<EmailSendJob>(
      queueName,
      async (job) => this.process(job),
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(this.config.get<string>('REDIS_PORT') ?? 6379),
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        },
        concurrency,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log(`Email worker ready: ${queueName} (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job<EmailSendJob>): Promise<{ messageId?: string; suppressed?: true; reason?: string }> {
    const { reportId, organizationId, teamId } = job.data;
    const ctx: RequestContext = {
      userId: 'system:email-worker',
      organizationId,
      teamId,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
    };

    return TenantContext.run(ctx, async () => {
      const report = await this.prisma.scoped.emailReport.findFirst({
        where: { id: reportId },
        include: {
          contact: true,
          campaign: { include: { template: true, smtpAccount: true } },
        },
      });
      if (!report) throw new Error(`EmailReport ${reportId} not found in tenant`);

      const template = report.campaign.template;
      const account = report.campaign.smtpAccount;
      if (!template) throw new Error(`Campaign ${report.campaignId} has no template`);
      if (!account) throw new Error(`Campaign ${report.campaignId} has no smtpAccount`);

      const supp = await this.suppression.check({
        email: report.contact.email,
        campaignId: report.campaignId,
      });
      if (supp.suppressed) {
        await this.prisma.scoped.emailReport.update({
          where: { id: reportId },
          data: { status: 'SUPPRESSED', error: supp.reason ?? 'suppressed' },
        });
        this.logger.log(`Report ${reportId} suprimido (${supp.reason}) — skip send`);
        return { suppressed: true, reason: supp.reason };
      }

      const vars = (report.contact.data as Record<string, unknown> | null) ?? {};
      const subject = Handlebars.compile(template.subject, { noEscape: false })(vars);
      const renderedHtml = Handlebars.compile(template.html, { noEscape: true })(vars);

      const trackingToken = this.tokens.sign({
        r: report.id,
        o: report.organizationId,
        t: report.teamId,
        c: report.campaignId,
      });
      const html = prepareHtmlForTracking({
        html: renderedHtml,
        token: trackingToken,
        publicUrl: this.tokens.publicUrl(),
      });

      try {
        const result = await this.senders.sendForAccount(
          {
            id: account.id,
            teamId: account.teamId,
            host: account.host,
            port: account.port,
            username: account.username,
            passwordEnc: account.passwordEnc,
            fromName: account.fromName,
            fromEmail: account.fromEmail,
            provider: account.provider,
            sesConfigSet: account.sesConfigSet,
          },
          { to: report.contact.email, subject, html },
        );

        await this.prisma.scoped.emailReport.update({
          where: { id: reportId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            subject,
            html,
            smtpMessageId: result.messageId,
            trackingToken,
            error: null,
          },
        });
        return { messageId: result.messageId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        await this.prisma.scoped.emailReport.update({
          where: { id: reportId },
          data: { status: 'FAILED', error: msg.slice(0, 500) },
        });
        throw err;
      }
    });
  }
}
