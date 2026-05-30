import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EmailCampaign } from '@massivo/prisma';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailQueueService } from '../queue/email-queue.service';
import { EventsService } from '../../events/events.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { ContactUpsertService } from '../../contacts/contact-upsert.service';
import { QuotaService } from '../../../common/quota/quota.service';
import {
  AddCampaignContactsDto,
  CampaignContactDto,
  CreateEmailCampaignDto,
  UpdateEmailCampaignDto,
} from './email-campaigns.dto';

const EDITABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PAUSED']);
const SENDABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PAUSED']);

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: EmailQueueService,
    private readonly events: EventsService,
    private readonly contactUpsert: ContactUpsertService,
    private readonly quota: QuotaService,
  ) {}

  private notifyCampaignUpdated(teamId: string, campaignId: string): void {
    this.events.emitToTeamDebounced(
      teamId,
      'email.report.updated',
      campaignId,
      { campaignId },
    );
  }

  async create(dto: CreateEmailCampaignDto): Promise<EmailCampaign> {
    if (dto.scheduledAt && dto.scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException('scheduledAt debe ser futuro');
    }
    return this.prisma.scoped.emailCampaign.create({
      data: {
        name: dto.name,
        templateId: dto.templateId,
        smtpAccountId: dto.smtpAccountId,
        scheduledAt: dto.scheduledAt,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      } as never,
    });
  }

  async findAll(): Promise<unknown[]> {
    return this.prisma.scoped.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true, reports: true } } },
    });
  }

  async findOne(id: string): Promise<EmailCampaign & Record<string, unknown>> {
    const c = await this.prisma.scoped.emailCampaign.findFirst({
      where: { id },
      include: {
        template: { select: { id: true, name: true, subject: true } },
        smtpAccount: { select: { id: true, fromEmail: true, fromName: true, provider: true } },
        _count: { select: { contacts: true, reports: true } },
      },
    });
    if (!c) throw new NotFoundException(`Campaign ${id} no encontrada`);
    return c as never;
  }

  async update(id: string, dto: UpdateEmailCampaignDto): Promise<EmailCampaign> {
    const current = await this.findOne(id);
    if (!EDITABLE_STATUSES.has(current.status)) {
      throw new ConflictException(`No se puede editar campaign en estado ${current.status}`);
    }
    if (dto.scheduledAt && dto.scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException('scheduledAt debe ser futuro');
    }
    const data: Record<string, unknown> = { ...dto };
    if (dto.scheduledAt !== undefined) {
      if (current.status === 'DRAFT' && dto.scheduledAt) {
        data.status = 'SCHEDULED';
      } else if (current.status === 'SCHEDULED' && dto.scheduledAt === null) {
        data.status = 'DRAFT';
      }
    }
    return this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(id: string): Promise<void> {
    const current = await this.findOne(id);
    if (current.status === 'PROCESSING') {
      throw new ConflictException('No se puede borrar campaign PROCESSING');
    }
    await this.prisma.scoped.emailCampaign.delete({ where: { id } });
  }

  async addContacts(
    id: string,
    dto: AddCampaignContactsDto,
  ): Promise<{
    created: number;
    contactsCreated: number;
    contactsUpdated: number;
    suggestionsCreated: number;
  }> {
    const campaign = await this.findOne(id);
    if (!EDITABLE_STATUSES.has(campaign.status)) {
      throw new ConflictException(`No se pueden agregar contactos en estado ${campaign.status}`);
    }

    const missing: number[] = [];
    dto.contacts.forEach((c, i) => {
      if (!hasStrongKey(c)) missing.push(i + 1);
    });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cada fila debe traer externalId o dni. Filas inválidas: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '…' : ''}`,
      );
    }

    let contactsCreated = 0;
    let contactsUpdated = 0;
    let suggestionsCreated = 0;
    let emailContactsCreated = 0;

    for (const c of dto.contacts) {
      const { firstName, lastName } = splitName(c);
      const upsert = await this.contactUpsert.upsert({
        externalId: c.externalId ?? null,
        dni: c.dni ?? null,
        cuit: c.cuit ?? null,
        email: c.email,
        firstName,
        lastName,
        attributes: c.data ?? null,
      });
      if (upsert.outcome === 'created') contactsCreated++;
      else if (upsert.outcome === 'updated') contactsUpdated++;
      else if (upsert.outcome === 'suggested') suggestionsCreated++;

      await this.prisma.scoped.emailContact.create({
        data: {
          campaignId: id,
          email: c.email.trim().toLowerCase(),
          name: c.name,
          data: c.data,
          contactId: upsert.contactId,
        } as never,
      });
      emailContactsCreated++;
    }

    return {
      created: emailContactsCreated,
      contactsCreated,
      contactsUpdated,
      suggestionsCreated,
    };
  }

  /**
   * Crea EmailReport por contacto + enquola job por cada uno. Marca PROCESSING.
   * Idempotente a nivel de job (BullMQ jobId=reportId).
   *
   * Aplica enforcement de quota mensual del plan con **corte parcial**: si los
   * contactos exceden el `remaining` del mes, los primeros N van a PENDING y
   * se encolan; el resto se crea con status `CANCELED` + error `quota-exceeded:plan-<code>`
   * (no se encolan). Si la quota está totalmente consumida, todos los reports
   * salen CANCELED y la campaña se marca COMPLETED directamente.
   */
  async send(id: string): Promise<{
    enqueued: number;
    quotaSkipped: number;
    quota: {
      planCode: string;
      used: number;
      limit: number | null;
      remaining: number | null;
    };
  }> {
    const campaign = await this.prisma.scoped.emailCampaign.findFirst({
      where: { id },
      include: { contacts: { select: { id: true } } },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} no encontrada`);
    if (!SENDABLE_STATUSES.has(campaign.status)) {
      throw new ConflictException(`No se puede enviar campaign en estado ${campaign.status}`);
    }
    if (!campaign.templateId) throw new BadRequestException('Falta templateId');
    if (!campaign.smtpAccountId) throw new BadRequestException('Falta smtpAccountId');
    if (campaign.contacts.length === 0) throw new BadRequestException('Campaign sin contactos');

    const ctx = TenantContext.current();
    if (!ctx) throw new Error('send sin TenantContext');

    const quota = await this.quota.getSnapshot(ctx.organizationId, 'EMAIL');
    const total = campaign.contacts.length;
    const allowed = quota.remaining === null ? total : Math.min(total, quota.remaining);
    const skipped = total - allowed;
    const quotaError = `quota-exceeded:plan-${quota.planCode}`;

    // Si no entra nadie: pasamos directo a COMPLETED para no dejar la campaña
    // colgada en PROCESSING (no se encola nada, el worker nunca corre
    // maybeCompleteCampaign).
    const initialStatus = allowed === 0 ? 'COMPLETED' : 'PROCESSING';
    await this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: { status: initialStatus },
    });

    const reports = await this.prisma.$transaction(
      campaign.contacts.map((c, idx) =>
        this.prisma.emailReport.create({
          data: {
            organizationId: ctx.organizationId,
            teamId: ctx.teamId,
            campaignId: id,
            contactId: c.id,
            status: idx < allowed ? 'PENDING' : 'CANCELED',
            error: idx < allowed ? null : quotaError,
          },
          select: { id: true, status: true },
        }),
      ),
    );

    // Los primeros `allowed` reports son los PENDING (el resto vino CANCELED
    // del split). No leo `r.status` del retorno: el orden del create matchea
    // el del input por construcción.
    let enqueued = 0;
    for (let i = 0; i < Math.min(allowed, reports.length); i++) {
      await this.queue.enqueue({
        reportId: reports[i]!.id,
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
      });
      enqueued++;
    }

    this.logger.log(
      `Campaign ${id} → enqueued ${enqueued}/${total} (quota skipped: ${skipped}, plan=${quota.planCode}, used=${quota.used}, limit=${quota.limit ?? '∞'})`,
    );
    this.notifyCampaignUpdated(ctx.teamId, id);

    return {
      enqueued,
      quotaSkipped: skipped,
      quota: {
        planCode: quota.planCode,
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
      },
    };
  }

  /**
   * Pausa una campaign en PROCESSING. El worker chequea EmailCampaign.status
   * antes de procesar cada job y, si está PAUSED, mueve el job a delayed para
   * reintentar más tarde sin perderlo. No se cancelan jobs en BullMQ — el flag
   * en BD es la fuente de verdad y sobrevive reinicios del worker.
   */
  async pause(id: string): Promise<EmailCampaign> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('pause sin TenantContext');
    const current = await this.findOne(id);
    if (current.status !== 'PROCESSING') {
      throw new ConflictException(
        `Solo se puede pausar una campaign PROCESSING (estado actual: ${current.status})`,
      );
    }
    const updated = await this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
    this.logger.log(`Campaign ${id} → PAUSED`);
    this.notifyCampaignUpdated(ctx.teamId, id);
    return updated;
  }

  /**
   * Reanuda una campaign PAUSED. Re-enquola los reports que sigan en PENDING
   * (idempotente: jobId=reportId, BullMQ deduplica).
   */
  async resume(id: string): Promise<{ resumed: true; reEnqueued: number }> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('resume sin TenantContext');
    const current = await this.findOne(id);
    if (current.status !== 'PAUSED') {
      throw new ConflictException(
        `Solo se puede reanudar una campaign PAUSED (estado actual: ${current.status})`,
      );
    }

    await this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    const pending = await this.prisma.scoped.emailReport.findMany({
      where: { campaignId: id, status: 'PENDING' },
      select: { id: true },
    });
    for (const r of pending) {
      await this.queue.enqueue({
        reportId: r.id,
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
      });
    }
    this.logger.log(`Campaign ${id} → PROCESSING (re-enqueued ${pending.length} reports)`);
    this.notifyCampaignUpdated(ctx.teamId, id);
    return { resumed: true, reEnqueued: pending.length };
  }

  /**
   * Cierra forzadamente una campaign PROCESSING/PAUSED. Los reports PENDING
   * pasan a CANCELED; el worker los detecta al procesar (si llegan a correr)
   * y exit-early sin enviar.
   */
  async forceClose(id: string): Promise<{ closed: true; canceled: number }> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('forceClose sin TenantContext');
    const current = await this.findOne(id);
    if (current.status !== 'PROCESSING' && current.status !== 'PAUSED') {
      throw new ConflictException(
        `Solo se puede forzar cierre desde PROCESSING o PAUSED (estado actual: ${current.status})`,
      );
    }

    const canceled = await this.prisma.scoped.emailReport.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'CANCELED', error: 'force-closed' },
    });
    await this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
    this.logger.log(`Campaign ${id} → COMPLETED (force-close, canceled ${canceled.count} pending)`);
    this.notifyCampaignUpdated(ctx.teamId, id);
    return { closed: true, canceled: canceled.count };
  }

  /**
   * Lista paginada (cursor) de reports de una campaign. Filtros opcionales por status.
   * Incluye datos básicos del contact para no hacer N+1 en el frontend.
   */
  async listReports(
    campaignId: string,
    opts: { cursor?: string; limit?: number; status?: string } = {},
  ): Promise<{
    items: Array<{
      id: string;
      status: string;
      sentAt: Date | null;
      error: string | null;
      firstOpenedAt: Date | null;
      firstClickedAt: Date | null;
      smtpMessageId: string | null;
      createdAt: Date;
      updatedAt: Date;
      contact: { id: string; email: string; name: string | null };
      _count: { events: number };
    }>;
    nextCursor: string | null;
  }> {
    await this.findOne(campaignId); // valida tenant + existencia
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const where: Record<string, unknown> = { campaignId };
    if (opts.status) where.status = opts.status;

    const rows = await this.prisma.scoped.emailReport.findMany({
      where: where as never,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      select: {
        id: true,
        status: true,
        sentAt: true,
        error: true,
        firstOpenedAt: true,
        firstClickedAt: true,
        smtpMessageId: true,
        createdAt: true,
        updatedAt: true,
        contact: { select: { id: true, email: true, name: true } },
        _count: { select: { events: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;
    return { items: items as never, nextCursor };
  }

  /**
   * Lista cronológica de eventos (OPEN/CLICK) de un report individual.
   * Verifica que el report pertenezca a la campaign indicada (defensa en profundidad
   * además del scope de tenant que aplica la extensión Prisma).
   */
  async listReportEvents(
    campaignId: string,
    reportId: string,
  ): Promise<
    Array<{
      id: string;
      type: string;
      occurredAt: Date;
      targetUrl: string | null;
      targetDomain: string | null;
      ip: string | null;
      userAgent: string | null;
      deviceFamily: string | null;
      osName: string | null;
      osVersion: string | null;
      browserName: string | null;
      browserVersion: string | null;
    }>
  > {
    const report = await this.prisma.scoped.emailReport.findFirst({
      where: { id: reportId, campaignId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException(`Report ${reportId} no encontrado en campaign ${campaignId}`);

    const events = await this.prisma.scoped.emailEvent.findMany({
      where: { reportId },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        type: true,
        occurredAt: true,
        targetUrl: true,
        targetDomain: true,
        ip: true,
        userAgent: true,
        deviceFamily: true,
        osName: true,
        osVersion: true,
        browserName: true,
        browserVersion: true,
      },
    });
    return events as never;
  }

  async getReport(id: string): Promise<{
    campaignId: string;
    counts: Record<string, number>;
    events: { opens: number; clicks: number; uniqueOpens: number; uniqueClicks: number };
  }> {
    await this.findOne(id);

    const grouped = await this.prisma.scoped.emailReport.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      PENDING: 0, SENT: 0, FAILED: 0, BOUNCED: 0, COMPLAINED: 0, SUPPRESSED: 0, CANCELED: 0,
    };
    for (const g of grouped) counts[g.status] = g._count._all;

    const [opens, clicks, uniqueOpens, uniqueClicks] = await Promise.all([
      this.prisma.scoped.emailEvent.count({ where: { report: { campaignId: id }, type: 'OPEN' } }),
      this.prisma.scoped.emailEvent.count({ where: { report: { campaignId: id }, type: 'CLICK' } }),
      this.prisma.scoped.emailReport.count({
        where: { campaignId: id, firstOpenedAt: { not: null } },
      }),
      this.prisma.scoped.emailReport.count({
        where: { campaignId: id, firstClickedAt: { not: null } },
      }),
    ]);

    return {
      campaignId: id,
      counts,
      events: { opens, clicks, uniqueOpens, uniqueClicks },
    };
  }
}

function hasStrongKey(c: CampaignContactDto): boolean {
  return !!(c.externalId?.trim() || c.dni?.trim());
}

function splitName(c: CampaignContactDto): { firstName: string | null; lastName: string | null } {
  if (c.firstName || c.lastName) {
    return { firstName: c.firstName ?? null, lastName: c.lastName ?? null };
  }
  if (!c.name) return { firstName: null, lastName: null };
  const trimmed = c.name.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}
