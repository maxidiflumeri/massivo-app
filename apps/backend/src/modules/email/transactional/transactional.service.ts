import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Handlebars from 'handlebars';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EventLogger } from '../../../common/observability/event-logger.service';
import { QuotaService } from '../../../common/quota/quota.service';
import { EmailSenderService } from '../sender/email-sender.service';
import { TrackingTokenService } from '../tracking/tracking-token.service';
import { prepareHtmlForTracking } from '../tracking/prepare-html';
import {
  AttachmentFetchError,
  AttachmentsFetcherService,
} from './attachments-fetcher.service';
import type {
  TransactionalSendDto,
  ListTransactionalReportsDto,
} from './transactional.dto';

export interface TransactionalSendResult {
  reportId: string;
  messageId: string;
  provider: 'smtp' | 'ses';
}

/**
 * Envía un mail transaccional one-shot (1 destino, sin campaña, sin contact).
 * Pensado para integraciones desde el HTTP node del bot — ej. "recibir el
 * cupón de pago por mail" — y para futuras automatizaciones tipo "alerta
 * de quota baja al billing admin de la org".
 *
 * Diferencias vs. email-campaigns:
 *  - Síncrono: no se encola en BullMQ, se envía y persiste en la misma llamada.
 *  - Sin EmailContact: el destinatario se guarda en EmailReport.recipientEmail.
 *  - Cuenta contra la misma quota de plan (`emailsPerMonth`): un report
 *    transaccional con `sentAt` set cuenta igual que uno de campaña.
 *  - Tracking de opens/clicks aplicado (mismo prepareHtmlForTracking que
 *    campañas) para que los reports muestren engagement. El `c` del
 *    trackingToken queda vacío para distinguir transaccionales del lado
 *    consumer del payload.
 */
@Injectable()
export class TransactionalService {
  private readonly logger = new Logger(TransactionalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senders: EmailSenderService,
    private readonly quota: QuotaService,
    private readonly fetcher: AttachmentsFetcherService,
    private readonly tokens: TrackingTokenService,
    private readonly eventLogger: EventLogger,
  ) {}

  async send(dto: TransactionalSendDto): Promise<TransactionalSendResult> {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');

    // 1. Validar template (mismo org, opcionalmente mismo team — los OWNER/
    //    ADMIN ven todos los teams; un MEMBER de team A no debería poder usar
    //    el template del team B. Confiamos en el PoliciesGuard a nivel de
    //    endpoint para la verificación inicial, acá solo chequeamos org).
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id: dto.templateId, organizationId: ctx.organizationId },
    });
    if (!template) {
      throw new NotFoundException(`Template ${dto.templateId} no existe en esta org`);
    }

    // 2. Resolver SmtpAccount: explícito → template.default → error.
    const accountId = dto.smtpAccountId ?? template.smtpAccountId;
    if (!accountId) {
      throw new BadRequestException(
        'Falta smtpAccountId — el template no tiene cuenta default y no se especificó una.',
      );
    }
    const account = await this.prisma.smtpAccount.findFirst({
      where: { id: accountId, organizationId: ctx.organizationId },
    });
    if (!account) {
      throw new NotFoundException(`SmtpAccount ${accountId} no existe en esta org`);
    }
    if (!account.isActive) {
      throw new BadRequestException(
        `SmtpAccount ${account.name} está inactiva — no se puede enviar.`,
      );
    }

    // 3. Quota check (1 envío). Usa el snapshot global, mismo cálculo que
    //    campañas: count(EmailReport WHERE sentAt en el mes actual). El
    //    transaccional que vamos a crear con sentAt seteado también va a
    //    contar para futuros checks.
    const snap = await this.quota.getSnapshot(ctx.organizationId, 'EMAIL');
    if (snap.remaining !== null && snap.remaining <= 0) {
      throw new ForbiddenException(
        `Quota de mails excedida (plan=${snap.planCode}, used=${snap.used}, limit=${snap.limit}).`,
      );
    }

    // 4. Render Handlebars.
    const vars = dto.variables ?? {};
    let subject: string;
    let html: string;
    try {
      subject = Handlebars.compile(template.subject, { noEscape: false })(vars);
      html = Handlebars.compile(template.html, { noEscape: true })(vars);
    } catch (err) {
      throw new BadRequestException(
        `Error compilando template: ${(err as Error).message}`,
      );
    }

    // 5. Fetch attachments (con SSRF guard + size cap).
    let attachments;
    try {
      attachments = await this.fetcher.fetchAll(dto.attachments ?? []);
    } catch (err) {
      if (err instanceof AttachmentFetchError) {
        throw new BadRequestException(`Adjunto falló: ${err.message}`);
      }
      throw err;
    }

    // 6. Crear EmailReport en estado PENDING (sin campaignId/contactId, con
    //    recipientEmail). El trackingToken se firma con el id del report y
    //    queda persistido para que open/click endpoints lo resuelvan.
    const report = await this.prisma.emailReport.create({
      data: {
        organizationId: ctx.organizationId,
        teamId: account.teamId,
        recipientEmail: dto.toEmail,
        status: 'PENDING',
        subject,
        html,
      },
    });

    const trackingToken = this.tokens.sign({
      r: report.id,
      o: ctx.organizationId,
      t: account.teamId,
      c: '', // Transaccional sin campaña — el consumer ramea por c vacío.
    });
    await this.prisma.emailReport.update({
      where: { id: report.id },
      data: { trackingToken },
    });

    // 7. Aplicar tracking (pixel + click rewrite). El unsubscribe scope queda
    //    como `scope=transactional` para distinguir del CAMPAIGN scope; el
    //    handler de unsubscribe lo marca como global del recipiente.
    const publicUrl = this.tokens.publicUrl();
    const unsubscribeUrl = `${publicUrl}/api/unsubscribe?t=${encodeURIComponent(trackingToken)}&scope=transactional`;
    const senderLabel = account.fromName;
    const htmlTracked = prepareHtmlForTracking({
      html,
      token: trackingToken,
      publicUrl,
      unsubscribeUrl,
      senderLabel,
    });

    // 8. Enviar.
    const sendStartedAt = Date.now();
    try {
      const sendResult = await this.senders.sendForAccount(
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
          replyTo: account.replyTo,
        },
        {
          to: dto.toEmail,
          subject,
          html: htmlTracked,
          attachments,
          // RFC 8058: header obligatorio para envíos masivos (Gmail/Yahoo 2024)
          // pero también aplica a transaccionales si pasamos el límite.
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        },
      );

      await this.prisma.emailReport.update({
        where: { id: report.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          smtpMessageId: sendResult.messageId,
        },
      });

      this.logger.log(
        `Transactional sent ${report.id} → ${dto.toEmail} via ${sendResult.provider} (${sendResult.messageId})`,
      );
      this.eventLogger.emailSend({
        to: dto.toEmail,
        templateId: dto.templateId,
        smtpAccountId: account.id,
        success: true,
        smtpMessageId: sendResult.messageId,
        durationMs: Date.now() - sendStartedAt,
        transactional: true,
      });
      return {
        reportId: report.id,
        messageId: sendResult.messageId,
        provider: sendResult.provider,
      };
    } catch (err) {
      const error = (err as Error).message ?? 'unknown';
      await this.prisma.emailReport.update({
        where: { id: report.id },
        data: { status: 'FAILED', error: error.slice(0, 1000) },
      });
      this.logger.warn(`Transactional FAILED ${report.id} → ${dto.toEmail}: ${error}`);
      this.eventLogger.emailSend({
        to: dto.toEmail,
        templateId: dto.templateId,
        smtpAccountId: account.id,
        success: false,
        error,
        durationMs: Date.now() - sendStartedAt,
        transactional: true,
      });
      // Clasificar el error para que el caller pueda mostrar mensajes
      // amigables (en particular el caso típico de SES sandbox donde el
      // destinatario no está verificado).
      const code = classifySesError(error);
      throw new BadRequestException({
        message: `Error enviando mail: ${error}`,
        code,
        recipient: dto.toEmail,
      });
    }
  }

  /**
   * Lista paginada de reports transaccionales con filtros opcionales.
   * Filtra por `campaignId IS NULL` para no mezclar con campañas.
   */
  async listReports(q: ListTransactionalReportsDto) {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');

    const toDate = q.toDate ? new Date(q.toDate) : new Date();
    const fromDate = q.fromDate
      ? new Date(q.fromDate)
      : new Date(toDate.getTime() - 7 * 24 * 3600 * 1000);
    // Incluir todo el día final
    toDate.setUTCHours(23, 59, 59, 999);

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where = {
      organizationId: ctx.organizationId,
      campaignId: null,
      createdAt: { gte: fromDate, lte: toDate },
      ...(q.status ? { status: q.status } : {}),
      ...(q.recipient ? { recipientEmail: { contains: q.recipient, mode: 'insensitive' as const } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.emailReport.count({ where }),
      this.prisma.emailReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          recipientEmail: true,
          status: true,
          subject: true,
          createdAt: true,
          sentAt: true,
          firstOpenedAt: true,
          firstClickedAt: true,
          smtpMessageId: true,
          error: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Detalle de un report transaccional incluyendo timeline de eventos.
   */
  async getReportDetail(id: string) {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');

    const report = await this.prisma.emailReport.findFirst({
      where: { id, organizationId: ctx.organizationId, campaignId: null },
      select: {
        id: true,
        recipientEmail: true,
        status: true,
        subject: true,
        html: true,
        createdAt: true,
        sentAt: true,
        firstOpenedAt: true,
        firstClickedAt: true,
        smtpMessageId: true,
        error: true,
        events: {
          orderBy: { occurredAt: 'desc' },
          select: {
            id: true,
            type: true,
            occurredAt: true,
            ip: true,
            userAgent: true,
            targetUrl: true,
            deviceFamily: true,
            osName: true,
            browserName: true,
          },
        },
      },
    });
    if (!report) {
      throw new NotFoundException(`Report transaccional ${id} no encontrado`);
    }
    return report;
  }

  /**
   * Métricas agregadas de transaccionales en una ventana de N días.
   * Devuelve totales y tasas de open/click/bounce.
   */
  async getMetrics(days: number) {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');

    const clampedDays = Math.max(1, Math.min(days || 30, 365));
    const from = new Date(Date.now() - clampedDays * 24 * 3600 * 1000);
    const where = {
      organizationId: ctx.organizationId,
      campaignId: null,
      createdAt: { gte: from },
    };

    const [sent, failed, opens, clicks, bounces] = await Promise.all([
      this.prisma.emailReport.count({ where: { ...where, status: 'SENT' } }),
      this.prisma.emailReport.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.emailReport.count({
        where: { ...where, firstOpenedAt: { not: null } },
      }),
      this.prisma.emailReport.count({
        where: { ...where, firstClickedAt: { not: null } },
      }),
      this.prisma.emailReport.count({
        where: { ...where, status: 'BOUNCED' },
      }),
    ]);

    const rate = (n: number, d: number) =>
      d === 0 ? 0 : Math.round((n / d) * 10000) / 100;

    return {
      days: clampedDays,
      sent,
      failed,
      opens,
      clicks,
      bounces,
      openRate: rate(opens, sent),
      clickRate: rate(clicks, sent),
      bounceRate: rate(bounces, sent),
    };
  }
}

/**
 * Identifica códigos típicos del envío SES para que el cliente (bot, etc.)
 * pueda ramificar el mensaje de UX sin parsear strings libres.
 *  - `recipient-not-verified`: SES sandbox + destino no agregado como identity.
 *  - `sender-not-verified`: el `From` no es una identidad verificada.
 *  - `rate-limited`: tope per-second o per-24h del SES.
 *  - `quota-exceeded`: app-level quota (este service ya throw 403 antes,
 *     pero por si SES lo devuelve también).
 *  - `unknown`: fallback genérico.
 */
function classifySesError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('not verified') && lower.includes('email address')) {
    return 'recipient-not-verified';
  }
  if (lower.includes('mailfromdomainnotverified') || lower.includes('sender')) {
    return 'sender-not-verified';
  }
  if (lower.includes('throttling') || lower.includes('maximum sending rate')) {
    return 'rate-limited';
  }
  if (lower.includes('quota')) {
    return 'quota-exceeded';
  }
  return 'unknown';
}
