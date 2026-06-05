import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import {
  WapiSendException,
  type SendTemplateInput,
  type TemplateComponent,
} from '../sender/wapi-sender.types';
import { WapiOptOutService } from '../opt-out/wapi-opt-out.service';
import { QuotaService } from '../../../common/quota/quota.service';
import { WAPI_QUEUE_NAME, type WapiSendJob } from './wapi-queue.types';

const DEFAULT_DELAY_MIN_MS = 30_000;
const DEFAULT_DELAY_MAX_MS = 60_000;
const RATE_LIMIT_BASE_BACKOFF_MS = 60_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 60 * 60_000;
const DAILY_LIMIT_DEFER_MS = 60 * 60_000;

export interface WapiProcessOutcome {
  metaMessageId?: string;
  paused?: true;
  canceled?: true;
  rateLimited?: true;
  dailyLimitReached?: true;
}

/**
 * Worker BullMQ que procesa jobs `wapi-send`. Patrón calcado del EmailWorker:
 *  1. Reconstruye TenantContext desde el payload (orgId/teamId), role sintético
 *     OWNER/ADMIN — la authz ya pasó al enquolar.
 *  2. Carga WapiReport + WapiContact + WapiCampaign (con template + config) via
 *     `prisma.scoped` para que falle naturalmente si el job vino de otro tenant.
 *  3. Chequea control actions de campaña (PAUSED → moveToDelayed; COMPLETED →
 *     marca el report como FAILED con `campaign-closed`).
 *  4. Chequea daily limit per-config contando WapiReport SENT en las últimas
 *     24h. Si lo alcanzó, moveToDelayed 1h sin tocar el report.
 *  5. Llama `WapiSenderService.sendTemplate(...)` y mapea el resultado a
 *     WapiReport.SENT + metaMessageId. Si Meta tira un rate-limit code conocido
 *     (130429/131048/131056), moveToDelayed con backoff exponencial.
 *  6. Tras un envío OK aplica jitter sleep (`WAPI_DELAY_MIN_MS` /
 *     `WAPI_DELAY_MAX_MS`, default 30s/60s) — con concurrency=1 esto da rate
 *     limiting efectivo per-worker. Multi-worker sync vía Redis queda para
 *     cuando se necesite escalar.
 *
 *  El payload del job no carga el `accessToken` por seguridad: se decripta en
 *  el worker (placeholder hasta 4.B encriptación KMS).
 */
@Injectable()
export class WapiWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WapiWorkerService.name);
  private worker: Worker<WapiSendJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sender: WapiSenderService,
    private readonly events: EventsService,
    private readonly encryption: EncryptionService,
    private readonly optOut: WapiOptOutService,
    private readonly quota: QuotaService,
  ) {}

  private notifyReportUpdate(teamId: string, campaignId: string): void {
    this.events.emitToTeamDebounced(teamId, 'wapi.report.updated', campaignId, {
      campaignId,
    });
  }

  private notifyReportLog(
    teamId: string,
    entry: {
      campaignId: string;
      reportId: string;
      phone: string;
      status: 'SENT' | 'FAILED';
      metaMessageId?: string;
      error?: string;
    },
  ): void {
    this.events.emitToTeam(teamId, 'wapi.report.log', {
      ...entry,
      ts: new Date().toISOString(),
    });
  }

  private async maybeCompleteCampaign(campaignId: string, teamId: string): Promise<void> {
    const pending = await this.prisma.scoped.wapiReport.count({
      where: { campaignId, status: 'PENDING' },
    });
    if (pending > 0) return;

    const result = await this.prisma.wapiCampaign.updateMany({
      where: { id: campaignId, status: 'PROCESSING' },
      data: { status: 'COMPLETED' },
    });
    if (result.count > 0) {
      this.logger.log(`Campaign ${campaignId} → COMPLETED (no quedan reports PENDING)`);
      this.notifyReportUpdate(teamId, campaignId);
    }
  }

  /**
   * 4.Q — Throttle resuelto en cascada per-report:
   *   campaign.config.delayMinMs/Max → WapiConfig.sendDelayMinMs/Max → env
   *   (WAPI_DELAY_MIN_MS / WAPI_DELAY_MAX_MS) → defaults (30s/60s).
   * Los pares min/max se resuelven independientes, después se ordenan para
   * tolerar config sucia (min>max no debería pasar pero validate-only no es
   * suficiente — alguien edita Postgres a mano y rompemos producción).
   */
  private jitterMs(opts?: { campaignConfig?: unknown; configRel?: { sendDelayMinMs?: number; sendDelayMaxMs?: number } }): number {
    const cmp = (opts?.campaignConfig ?? null) as { delayMinMs?: number; delayMaxMs?: number } | null;
    const cfg = opts?.configRel;
    const envMin = this.config.get<string>('WAPI_DELAY_MIN_MS');
    const envMax = this.config.get<string>('WAPI_DELAY_MAX_MS');
    const min = cmp?.delayMinMs ?? cfg?.sendDelayMinMs ?? (envMin !== undefined ? Number(envMin) : DEFAULT_DELAY_MIN_MS);
    const max = cmp?.delayMaxMs ?? cfg?.sendDelayMaxMs ?? (envMax !== undefined ? Number(envMax) : DEFAULT_DELAY_MAX_MS);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(lo + Math.random() * (hi - lo));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Cuenta cuántos `WapiReport` con `status='SENT'` se enviaron desde
   * la misma `configId` en las últimas 24h. La lectura es scoped por tenant
   * (un teamId no puede ver counts de otro), pero el filtro real es por
   * `campaign.configId` para que el daily limit sea per-config Meta.
   */
  private async countSentLast24h(configId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    return this.prisma.scoped.wapiReport.count({
      where: {
        status: 'SENT',
        sentAt: { gte: since },
        campaign: { channelId: configId },
      },
    });
  }

  onModuleInit(): void {
    if (this.config.get<string>('WAPI_WORKER_ENABLED') === 'false') {
      this.logger.warn('Wapi worker disabled via WAPI_WORKER_ENABLED=false');
      return;
    }
    const queueName = this.config.get<string>('WAPI_QUEUE_NAME') ?? WAPI_QUEUE_NAME;
    const concurrency = Number(this.config.get<string>('WAPI_WORKER_CONCURRENCY') ?? 1);

    this.worker = new Worker<WapiSendJob>(
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
    this.logger.log(`Wapi worker ready: ${queueName} (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Job<WapiSendJob>): Promise<WapiProcessOutcome> {
    const { reportId, organizationId, teamId } = job.data;
    const ctx: RequestContext = {
      userId: 'system:wapi-worker',
      organizationId,
      teamId,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
    };

    return TenantContext.run(ctx, async () => {
      const report = await this.prisma.scoped.wapiReport.findFirst({
        where: { id: reportId },
        include: {
          contact: true,
          campaign: { include: { template: true, channel: true } },
        },
      });
      if (!report) throw new Error(`WapiReport ${reportId} not found in tenant`);

      // Si el report ya no está PENDING (forceClose lo dejó CANCELED, o se
      // procesó en una corrida anterior), no hay nada que hacer.
      if (report.status !== 'PENDING') {
        this.logger.log(
          `Job ${job.id} → skip (report ${reportId} ya en estado ${report.status})`,
        );
        return { canceled: true };
      }

      // Control actions
      const campaignStatus = report.campaign.status;
      if (campaignStatus === 'PAUSED') {
        await job.moveToDelayed(Date.now() + 30_000, job.token);
        this.logger.log(
          `Job ${job.id} → delayed 30s (campaign ${report.campaignId} PAUSED)`,
        );
        return { paused: true };
      }
      if (campaignStatus === 'COMPLETED' || campaignStatus === 'FAILED') {
        await this.prisma.scoped.wapiReport.update({
          where: { id: reportId },
          data: { status: 'CANCELED', error: 'campaign-closed' },
        });
        this.notifyReportUpdate(teamId, report.campaignId);
        this.notifyReportLog(teamId, {
          campaignId: report.campaignId,
          reportId,
          phone: report.phone,
          status: 'FAILED',
          error: 'campaign-closed',
        });
        return { canceled: true };
      }

      const template = report.campaign.template;
      const cfg = report.campaign.channel;
      if (!template) throw new Error(`Campaign ${report.campaignId} has no template`);
      if (!cfg) throw new Error(`Campaign ${report.campaignId} has no config`);

      // 4.H: chequeo opt-out (GLOBAL o por esta campaña). Skip definitivo —
      // marca CANCELED con error `opted-out` para que el reporte muestre el
      // motivo. No tocamos campaign status acá (maybeCompleteCampaign al final).
      const optOutCheck = await this.optOut.check({
        phone: report.phone,
        campaignId: report.campaignId,
      });
      if (optOutCheck.optedOut) {
        await this.prisma.scoped.wapiReport.update({
          where: { id: reportId },
          data: { status: 'CANCELED', error: `opted-out:${optOutCheck.scope?.toLowerCase() ?? 'global'}` },
        });
        this.notifyReportUpdate(teamId, report.campaignId);
        this.notifyReportLog(teamId, {
          campaignId: report.campaignId,
          reportId,
          phone: report.phone,
          status: 'FAILED',
          error: `opted-out:${optOutCheck.scope?.toLowerCase() ?? 'global'}`,
        });
        await this.maybeCompleteCampaign(report.campaignId, teamId);
        return { canceled: true };
      }

      // Defense in depth: el send() del service ya rebanó por quota mensual,
      // pero entre el split y este job pudieron correr otros jobs/campañas y
      // dejar la cuenta en 0. Re-chequea y cancela el report si excede.
      const quota = await this.quota.getSnapshot(organizationId, 'WAPI');
      if (quota.remaining !== null && quota.remaining <= 0) {
        const quotaError = `quota-exceeded:plan-${quota.planCode}`;
        await this.prisma.scoped.wapiReport.update({
          where: { id: reportId },
          data: { status: 'CANCELED', error: quotaError, failedAt: new Date() },
        });
        this.notifyReportUpdate(teamId, report.campaignId);
        this.notifyReportLog(teamId, {
          campaignId: report.campaignId,
          reportId,
          phone: report.phone,
          status: 'FAILED',
          error: quotaError,
        });
        await this.maybeCompleteCampaign(report.campaignId, teamId);
        this.logger.warn(
          `Report ${reportId} → CANCELED (quota exceeded plan=${quota.planCode}, used=${quota.used}, limit=${quota.limit})`,
        );
        return { canceled: true };
      }

      // Daily limit per WapiConfig
      const sentToday = await this.countSentLast24h(cfg.id);
      if (sentToday >= cfg.dailyLimit) {
        await job.moveToDelayed(Date.now() + DAILY_LIMIT_DEFER_MS, job.token);
        this.logger.warn(
          `Job ${job.id} → delayed 1h (config ${cfg.id} alcanzó dailyLimit ${cfg.dailyLimit})`,
        );
        return { dailyLimitReached: true };
      }

      const components = this.buildTemplateComponents(
        report.campaign.config,
        report.contact.data,
        report.contact.name,
      );
      const sendInput: SendTemplateInput = {
        to: report.phone,
        templateName: template.metaName,
        language: template.language,
        ...(components.length > 0 ? { components } : {}),
      };

      try {
        const result = await this.sender.sendTemplate(
          {
            phoneNumberId: cfg.phoneNumberId,
            accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
            isTestMode: cfg.isTestMode,
          },
          sendInput,
        );

        await this.prisma.scoped.wapiReport.update({
          where: { id: reportId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            metaMessageId: result.metaMessageId,
            error: null,
          },
        });
        this.notifyReportUpdate(teamId, report.campaignId);
        this.notifyReportLog(teamId, {
          campaignId: report.campaignId,
          reportId,
          phone: report.phone,
          status: 'SENT',
          metaMessageId: result.metaMessageId,
        });
        await this.maybeCompleteCampaign(report.campaignId, teamId);
        await this.sleep(
          this.jitterMs({
            campaignConfig: report.campaign.config,
            configRel: report.campaign.channel ?? undefined,
          }),
        );
        return { metaMessageId: result.metaMessageId };
      } catch (err) {
        if (err instanceof WapiSendException && err.detail.isRateLimit) {
          // Rate limit: NO marcamos FAILED, dejamos PENDING y delayamos. Backoff
          // exponencial limitado por attemptsMade (BullMQ ya cuenta intentos).
          const attempt = job.attemptsMade ?? 0;
          const backoff = Math.min(
            RATE_LIMIT_BASE_BACKOFF_MS * Math.pow(2, attempt),
            RATE_LIMIT_MAX_BACKOFF_MS,
          );
          await job.moveToDelayed(Date.now() + backoff, job.token);
          this.logger.warn(
            `Rate-limit code=${err.detail.code} → delayed ${backoff}ms (attempt=${attempt})`,
          );
          return { rateLimited: true };
        }

        const msg = err instanceof Error ? err.message : 'unknown error';
        await this.prisma.scoped.wapiReport.update({
          where: { id: reportId },
          data: {
            status: 'FAILED',
            error: msg.slice(0, 500),
            failedAt: new Date(),
          },
        });
        this.notifyReportUpdate(teamId, report.campaignId);
        this.notifyReportLog(teamId, {
          campaignId: report.campaignId,
          reportId,
          phone: report.phone,
          status: 'FAILED',
          error: msg.slice(0, 500),
        });
        await this.maybeCompleteCampaign(report.campaignId, teamId);
        throw err;
      }
    });
  }

  /**
   * Mapea variables de `WapiContact.data` a `TemplateComponent.parameters`
   * según el `campaign.config.bodyVars` (array ordenado de keys o textos
   * literales). Si no hay vars en la config → componentes vacíos (template
   * parameterless).
   */
  private buildTemplateComponents(
    campaignConfig: unknown,
    contactData: unknown,
    contactName: string | null = null,
  ): TemplateComponent[] {
    const cfg = (campaignConfig ?? {}) as { bodyVars?: string[] };
    const vars = cfg.bodyVars;
    if (!Array.isArray(vars) || vars.length === 0) return [];

    const data = (contactData ?? {}) as Record<string, unknown>;
    const parameters = vars.map((spec, idx) => {
      let value = data[spec];
      // Fallback: si la spec es "name"/"nombre" y data no la tiene, usar el
      // escalar contact.name. Esto rescata contactos cargados antes del fix
      // del parser que hoisteaba name/nombre fuera de data.
      if ((value === undefined || value === null || value === '') && contactName) {
        const k = spec.toLowerCase();
        if (k === 'name' || k === 'nombre') value = contactName;
      }
      const text = value === undefined || value === null ? '' : String(value).trim();
      if (!text) {
        throw new Error(
          `Variable {{${idx + 1}}} (columna "${spec}") está vacía o no existe en este contacto`,
        );
      }
      return { type: 'text' as const, text };
    });
    return [{ type: 'body', parameters }];
  }
}
