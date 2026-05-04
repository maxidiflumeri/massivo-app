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

const SENDABLE_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PAUSED']);

/**
 * Placeholder de send-only para 4.A. CRUD completo (`create`/`update`/
 * `addContacts`/`pause`/`resume`/`forceClose`) viene en 4.E.
 *
 * Crea un `WapiReport` por contacto asociado a la campaign y enquola un job en
 * la queue `wapi-send`. Marca la campaign como PROCESSING. Idempotente vía
 * jobId=reportId.
 */
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

    // Crea WapiReport por contacto. `phone` se copia para que el report
    // sobreviva si después se elimina el WapiContact.
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

  async findOne(id: string): Promise<WapiCampaign> {
    const c = await this.prisma.scoped.wapiCampaign.findFirst({ where: { id } });
    if (!c) throw new NotFoundException(`WapiCampaign ${id} no encontrada`);
    return c;
  }
}
