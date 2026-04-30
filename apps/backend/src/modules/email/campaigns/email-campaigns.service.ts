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
import { TenantContext } from '../../../common/auth/tenant-context';
import {
  AddCampaignContactsDto,
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
  ) {}

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
    return this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: string): Promise<void> {
    const current = await this.findOne(id);
    if (current.status === 'PROCESSING') {
      throw new ConflictException('No se puede borrar campaign PROCESSING');
    }
    await this.prisma.scoped.emailCampaign.delete({ where: { id } });
  }

  async addContacts(id: string, dto: AddCampaignContactsDto): Promise<{ created: number }> {
    const campaign = await this.findOne(id);
    if (!EDITABLE_STATUSES.has(campaign.status)) {
      throw new ConflictException(`No se pueden agregar contactos en estado ${campaign.status}`);
    }
    const result = await this.prisma.scoped.emailContact.createMany({
      data: dto.contacts.map((c) => ({
        campaignId: id,
        email: c.email.trim().toLowerCase(),
        name: c.name,
        data: c.data,
      })) as never,
    });
    return { created: result.count };
  }

  /**
   * Crea EmailReport por contacto + enquola job por cada uno. Marca PROCESSING.
   * Idempotente a nivel de job (BullMQ jobId=reportId).
   */
  async send(id: string): Promise<{ enqueued: number }> {
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

    await this.prisma.scoped.emailCampaign.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    const reports = await this.prisma.$transaction(
      campaign.contacts.map((c) =>
        this.prisma.emailReport.create({
          data: {
            organizationId: ctx.organizationId,
            teamId: ctx.teamId,
            campaignId: id,
            contactId: c.id,
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

    this.logger.log(`Campaign ${id} → enqueued ${reports.length} reports`);
    return { enqueued: reports.length };
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
      PENDING: 0, SENT: 0, FAILED: 0, BOUNCED: 0, COMPLAINED: 0, SUPPRESSED: 0,
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
