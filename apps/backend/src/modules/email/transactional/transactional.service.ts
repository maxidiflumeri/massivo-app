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
import { QuotaService } from '../../../common/quota/quota.service';
import { EmailSenderService } from '../sender/email-sender.service';
import {
  AttachmentFetchError,
  AttachmentsFetcherService,
} from './attachments-fetcher.service';
import type { TransactionalSendDto } from './transactional.dto';

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
 *  - Sin tracking: no rewriting de links ni pixel de open (transaccional
 *    históricamente no usa marketing tracking; lo agregamos si lo piden).
 *  - Sin EmailContact: el destinatario se guarda en EmailReport.recipientEmail.
 *  - Cuenta contra la misma quota de plan (`emailsPerMonth`): un report
 *    transaccional con `sentAt` set cuenta igual que uno de campaña.
 */
@Injectable()
export class TransactionalService {
  private readonly logger = new Logger(TransactionalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senders: EmailSenderService,
    private readonly quota: QuotaService,
    private readonly fetcher: AttachmentsFetcherService,
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
    //    recipientEmail). Si el send falla, lo dejamos en FAILED con error.
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

    // 7. Enviar.
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
          html,
          attachments,
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
