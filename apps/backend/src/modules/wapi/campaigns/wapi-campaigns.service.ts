import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { WapiCampaign } from '@massivo/prisma';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EventsService } from '../../events/events.service';
import { WapiQueueService } from '../queue/wapi-queue.service';
import {
  AddWapiCampaignContactsDto,
  CreateWapiCampaignDto,
  UpdateWapiCampaignDto,
} from './wapi-campaigns.dto';

const EDITABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PAUSED']);
const SENDABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PAUSED']);

@Injectable()
export class WapiCampaignsService {
  private readonly logger = new Logger(WapiCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WapiQueueService,
    private readonly events: EventsService,
  ) {}

  private notifyCampaignUpdated(teamId: string, campaignId: string): void {
    this.events.emitToTeamDebounced(teamId, 'wapi.report.updated', campaignId, {
      campaignId,
    });
  }

  async create(dto: CreateWapiCampaignDto): Promise<WapiCampaign> {
    if (dto.scheduledAt && dto.scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException('scheduledAt debe ser futuro');
    }
    return this.prisma.scoped.wapiCampaign.create({
      data: {
        name: dto.name,
        templateId: dto.templateId,
        configId: dto.configId,
        scheduledAt: dto.scheduledAt,
        status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      } as never,
    });
  }

  async findAll(): Promise<unknown[]> {
    return this.prisma.scoped.wapiCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true, reports: true } } },
    });
  }

  async findOne(id: string): Promise<WapiCampaign & Record<string, unknown>> {
    const c = await this.prisma.scoped.wapiCampaign.findFirst({
      where: { id },
      include: {
        template: { select: { id: true, metaName: true, language: true, category: true } },
        configRel: { select: { id: true, name: true, phoneNumberId: true } },
        _count: { select: { contacts: true, reports: true } },
      },
    });
    if (!c) throw new NotFoundException(`WapiCampaign ${id} no encontrada`);
    return c as never;
  }

  async update(id: string, dto: UpdateWapiCampaignDto): Promise<WapiCampaign> {
    const current = await this.findOne(id);
    if (!EDITABLE_STATUSES.has(current.status)) {
      throw new ConflictException(`No se puede editar campaign en estado ${current.status}`);
    }
    if (dto.scheduledAt && dto.scheduledAt.getTime() < Date.now()) {
      throw new BadRequestException('scheduledAt debe ser futuro');
    }
    return this.prisma.scoped.wapiCampaign.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: string): Promise<void> {
    const current = await this.findOne(id);
    if (current.status === 'PROCESSING') {
      throw new ConflictException('No se puede borrar campaign PROCESSING');
    }
    await this.prisma.scoped.wapiCampaign.delete({ where: { id } });
  }

  /**
   * Devuelve la unión de keys de `WapiContact.data` para todos los contactos
   * de la campaña. Útil para sugerir columnas en el mapeo de variables del
   * template sin pedirle al usuario re-pegar el CSV. Toma una muestra acotada
   * (los CSV típicos son uniformes, así que con los primeros N alcanza).
   */
  async getContactDataKeys(campaignId: string): Promise<string[]> {
    await this.findOne(campaignId);
    const rows = await this.prisma.scoped.wapiContact.findMany({
      where: { campaignId } as never,
      select: { data: true },
      take: 200,
    });
    const keys = new Set<string>();
    for (const r of rows) {
      const d = r.data as Record<string, unknown> | null;
      if (d && typeof d === 'object') {
        for (const k of Object.keys(d)) keys.add(k);
      }
    }
    return Array.from(keys).sort();
  }

  async addContacts(
    id: string,
    dto: AddWapiCampaignContactsDto,
  ): Promise<{ created: number }> {
    const campaign = await this.findOne(id);
    if (!EDITABLE_STATUSES.has(campaign.status)) {
      throw new ConflictException(
        `No se pueden agregar contactos en estado ${campaign.status}`,
      );
    }
    const result = await this.prisma.scoped.wapiContact.createMany({
      data: dto.contacts.map((c) => ({
        campaignId: id,
        phone: c.phone.trim(),
        name: c.name,
        data: c.data,
      })) as never,
    });
    return { created: result.count };
  }

  /**
   * Crea WapiReport por contacto + enquola job por cada uno. Marca PROCESSING.
   * Idempotente a nivel de job (BullMQ jobId=reportId).
   */
  async send(id: string): Promise<{ enqueued: number }> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('send sin TenantContext');

    const campaign = await this.prisma.scoped.wapiCampaign.findFirst({
      where: { id },
      include: { contacts: { select: { id: true, phone: true } } },
    });
    if (!campaign) throw new NotFoundException(`WapiCampaign ${id} no encontrada`);
    if (!SENDABLE_STATUSES.has(campaign.status)) {
      throw new ConflictException(`No se puede enviar campaign en estado ${campaign.status}`);
    }
    if (!campaign.templateId) throw new BadRequestException('Falta templateId');
    if (!campaign.configId) throw new BadRequestException('Falta configId');
    if (campaign.contacts.length === 0) throw new BadRequestException('Campaign sin contactos');

    await this.prisma.scoped.wapiCampaign.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    const reports = await this.prisma.$transaction(
      campaign.contacts.map((c) =>
        this.prisma.wapiReport.create({
          data: {
            organizationId: ctx.organizationId,
            teamId: ctx.teamId,
            campaignId: id,
            contactId: c.id,
            phone: c.phone,
            status: 'PENDING',
          },
          select: { id: true },
        }),
      ),
    );

    for (const r of reports) {
      await this.queue.enqueue({
        reportId: r.id,
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
      });
    }

    this.logger.log(`WapiCampaign ${id} → enqueued ${reports.length} reports`);
    this.notifyCampaignUpdated(ctx.teamId, id);
    return { enqueued: reports.length };
  }

  /**
   * Pausa campaign PROCESSING. El worker chequea WapiCampaign.status antes de
   * procesar y, si está PAUSED, hace moveToDelayed sin perder el job. La fuente
   * de verdad es el flag en BD (sobrevive reinicios).
   */
  async pause(id: string): Promise<WapiCampaign> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('pause sin TenantContext');
    const current = await this.findOne(id);
    if (current.status !== 'PROCESSING') {
      throw new ConflictException(
        `Solo se puede pausar una campaign PROCESSING (estado actual: ${current.status})`,
      );
    }
    const updated = await this.prisma.scoped.wapiCampaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
    this.logger.log(`WapiCampaign ${id} → PAUSED`);
    this.notifyCampaignUpdated(ctx.teamId, id);
    return updated;
  }

  /**
   * Reanuda campaign PAUSED. Re-enquola reports PENDING (idempotente:
   * jobId=reportId, BullMQ deduplica).
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

    await this.prisma.scoped.wapiCampaign.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    const pending = await this.prisma.scoped.wapiReport.findMany({
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
    this.logger.log(
      `WapiCampaign ${id} → PROCESSING (re-enqueued ${pending.length} reports)`,
    );
    this.notifyCampaignUpdated(ctx.teamId, id);
    return { resumed: true, reEnqueued: pending.length };
  }

  /**
   * Cierre forzado de campaign PROCESSING/PAUSED. Reports PENDING pasan a
   * CANCELED; el worker hace exit-early sin enviar si ve CANCELED.
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

    const canceled = await this.prisma.scoped.wapiReport.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'CANCELED', error: 'force-closed' },
    });
    await this.prisma.scoped.wapiCampaign.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
    this.logger.log(
      `WapiCampaign ${id} → COMPLETED (force-close, canceled ${canceled.count} pending)`,
    );
    this.notifyCampaignUpdated(ctx.teamId, id);
    return { closed: true, canceled: canceled.count };
  }

  /**
   * Lista paginada (cursor) de reports de una campaign. Filtros opcionales por
   * status. Incluye datos básicos del contact para evitar N+1.
   */
  async listReports(
    campaignId: string,
    opts: { cursor?: string; limit?: number; status?: string } = {},
  ): Promise<{
    items: Array<{
      id: string;
      status: string;
      phone: string;
      metaMessageId: string | null;
      sentAt: Date | null;
      deliveredAt: Date | null;
      readAt: Date | null;
      failedAt: Date | null;
      error: string | null;
      createdAt: Date;
      contact: { id: string; phone: string; name: string | null } | null;
    }>;
    nextCursor: string | null;
  }> {
    await this.findOne(campaignId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const where: Record<string, unknown> = { campaignId };
    if (opts.status) where.status = opts.status;

    const rows = await this.prisma.scoped.wapiReport.findMany({
      where: where as never,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      select: {
        id: true,
        status: true,
        phone: true,
        metaMessageId: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        error: true,
        createdAt: true,
        contact: { select: { id: true, phone: true, name: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;
    return { items: items as never, nextCursor };
  }

  /**
   * Resumen agregado por status. WAPI no tiene EmailEvent: los timestamps
   * (deliveredAt/readAt) viven en WapiReport y se incluyen como counts derivados
   * para que el frontend pueda mostrar funnels sin llamar listReports.
   */
  async getReport(id: string): Promise<{
    campaignId: string;
    counts: Record<string, number>;
    funnel: { sent: number; delivered: number; read: number; failed: number };
  }> {
    await this.findOne(id);

    const grouped = await this.prisma.scoped.wapiReport.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      PENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
      CANCELED: 0,
    };
    for (const g of grouped) counts[g.status] = g._count._all;

    const [sent, delivered, read, failed] = await Promise.all([
      this.prisma.scoped.wapiReport.count({
        where: { campaignId: id, sentAt: { not: null } },
      }),
      this.prisma.scoped.wapiReport.count({
        where: { campaignId: id, deliveredAt: { not: null } },
      }),
      this.prisma.scoped.wapiReport.count({
        where: { campaignId: id, readAt: { not: null } },
      }),
      this.prisma.scoped.wapiReport.count({
        where: { campaignId: id, failedAt: { not: null } },
      }),
    ]);

    return {
      campaignId: id,
      counts,
      funnel: { sent, delivered, read, failed },
    };
  }
}
