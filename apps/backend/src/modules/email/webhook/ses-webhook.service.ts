import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { SuppressionService } from '../suppression/suppression.service';
import type { SesEventNotification } from './sns-types';

interface TenantInfo { organizationId: string; teamId: string; }

/**
 * Procesa SES events recibidos vía SNS. El flujo:
 *  1. Resolver tenant: del `configurationSet` (formato `{prefix}{teamId}`) si está,
 *     fallback a buscar por `messageId` con cliente raíz (sin tenant scope) y
 *     extraer organizationId+teamId del EmailReport.
 *  2. Correr todo dentro de TenantContext.run para que prisma.scoped funcione.
 *  3. Persistir EmailEvent + actualizar status del EmailReport + agregar a
 *     suppression según el caso (Bounce permanent → unsub GLOBAL, Complaint → idem).
 *
 * Idempotente: si llega un duplicado del mismo (reportId, type) en menos de 2s
 * se descarta — SNS reintenta agresivo.
 */
@Injectable()
export class SesWebhookService {
  private readonly logger = new Logger(SesWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly suppression: SuppressionService,
    private readonly events: EventsService,
  ) {}

  private notify(teamId: string, campaignId: string): void {
    this.events.emitToTeamDebounced(
      teamId,
      'email.report.updated',
      campaignId,
      { campaignId },
    );
  }

  async process(event: SesEventNotification): Promise<void> {
    const tenant = await this.resolveTenant(event);
    if (!tenant) {
      this.logger.warn(`SES event sin tenant resoluble (messageId=${event.mail.messageId}, type=${event.eventType})`);
      return;
    }

    const ctx: RequestContext = {
      userId: 'system:ses-webhook',
      organizationId: tenant.organizationId,
      teamId: tenant.teamId,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
    };

    await TenantContext.run(ctx, async () => {
      const report = await this.prisma.scoped.emailReport.findFirst({
        where: { smtpMessageId: event.mail.messageId },
        select: { id: true, campaignId: true, contact: { select: { email: true } } },
      });
      if (!report) {
        this.logger.warn(`SES event para messageId ${event.mail.messageId} sin EmailReport en team ${tenant.teamId}`);
        return;
      }

      switch (event.eventType) {
        case 'Bounce':
          await this.handleBounce(report.id, report.contact.email, event);
          this.notify(tenant.teamId, report.campaignId);
          break;
        case 'Complaint':
          await this.handleComplaint(report.id, report.contact.email, event);
          this.notify(tenant.teamId, report.campaignId);
          break;
        case 'Delivery':
          await this.handleDelivery(report.id);
          break;
        case 'Open':
          await this.recordEvent(report.id, 'OPEN', event.open?.ipAddress, event.open?.userAgent);
          this.notify(tenant.teamId, report.campaignId);
          break;
        case 'Click':
          await this.recordEvent(
            report.id, 'CLICK', event.click?.ipAddress, event.click?.userAgent, event.click?.link,
          );
          this.notify(tenant.teamId, report.campaignId);
          break;
        default:
          this.logger.debug(`SES eventType ignorado: ${event.eventType}`);
      }
    });
  }

  private async handleBounce(reportId: string, email: string, event: SesEventNotification): Promise<void> {
    const isHard = event.bounce?.bounceType === 'Permanent';
    await this.prisma.scoped.emailBounce.create({
      data: {
        reportId,
        email,
        code: isHard ? 'hard' : 'soft',
        description: event.bounce?.bouncedRecipients[0]?.diagnosticCode?.slice(0, 500),
      } as never,
    });
    if (isHard) {
      await this.prisma.scoped.emailReport.update({
        where: { id: reportId },
        data: { status: 'BOUNCED' },
      });
      await this.suppression.addUnsubscribe({
        email,
        scope: 'GLOBAL',
        reason: 'ses-bounce-permanent',
        source: 'ses-webhook',
      });
    }
  }

  private async handleComplaint(reportId: string, email: string, _event: SesEventNotification): Promise<void> {
    await this.prisma.scoped.emailReport.update({
      where: { id: reportId },
      data: { status: 'COMPLAINED' },
    });
    await this.suppression.addUnsubscribe({
      email,
      scope: 'GLOBAL',
      reason: 'ses-complaint',
      source: 'ses-webhook',
    });
  }

  private async handleDelivery(_reportId: string): Promise<void> {
    // EmailEventType actual no incluye DELIVERY; el report ya está SENT desde el worker.
    // Registrar Delivery requeriría agregar el valor al enum (Fase 3.B futura).
  }

  private async recordEvent(
    reportId: string,
    type: 'OPEN' | 'CLICK',
    ip?: string,
    userAgent?: string,
    targetUrl?: string,
  ): Promise<void> {
    const recent = await this.prisma.scoped.emailEvent.findFirst({
      where: {
        reportId,
        type,
        ...(targetUrl ? { targetUrl } : {}),
        occurredAt: { gte: new Date(Date.now() - 2000) },
      },
    });
    if (recent) return;

    await this.prisma.scoped.emailEvent.create({
      data: {
        reportId,
        type,
        ip,
        userAgent,
        targetUrl,
        targetDomain: targetUrl ? safeDomain(targetUrl) : undefined,
      } as never,
    });

    const firstField = type === 'OPEN' ? 'firstOpenedAt' : 'firstClickedAt';
    await this.prisma.scoped.emailReport.updateMany({
      where: { id: reportId, [firstField]: null },
      data: { [firstField]: new Date() },
    });
  }

  /**
   * Resuelve (organizationId, teamId) primero por configurationSet (si SES lo
   * propaga en `mail.tags['ses:configuration-set']` o por `mail.configurationSet`,
   * dependiendo del payload — usamos messageId para fallback).
   */
  private async resolveTenant(
    event: SesEventNotification,
  ): Promise<{ organizationId: string; teamId: string } | null> {
    const prefix = this.config.get<string>('SES_CONFIG_SET_PREFIX') ?? 'massivo-team-';
    const configSetTag = event.mail.tags?.['ses:configuration-set']?.[0];
    if (configSetTag && configSetTag.startsWith(prefix)) {
      const teamId = configSetTag.slice(prefix.length);
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, organizationId: true },
      });
      if (team) return { organizationId: team.organizationId, teamId: team.id };
    }

    const report = await this.prisma.emailReport.findFirst({
      where: { smtpMessageId: event.mail.messageId },
      select: { organizationId: true, teamId: true },
    });
    return report ? { organizationId: report.organizationId, teamId: report.teamId } : null;
  }
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
