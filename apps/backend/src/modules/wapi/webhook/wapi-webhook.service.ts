import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import type {
  WapiWebhookMessage,
  WapiWebhookPayload,
  WapiWebhookStatus,
  WapiWebhookValue,
} from './wapi-webhook.types';

/**
 * Resolución de config por phone_number_id. El controller carga los configs en
 * un solo query y arma el map para que el service no vuelva a tocar la DB para
 * resolver tenant.
 */
export interface ResolvedWebhookConfig {
  configId: string;
  organizationId: string;
  teamId: string;
}

/**
 * Procesa eventos del webhook Meta. El controller ya validó firma y resolvió
 * los configs por `phone_number_id` — acá entramos directo al payload.
 *
 * Dos flujos paralelos por cada `entry[].changes[].value`:
 *  - `statuses[]`: actualiza WapiReport por `metaMessageId`. Map sent →
 *    (mantiene SENT), delivered → DELIVERED + deliveredAt, read → READ +
 *    readAt, failed → FAILED + failedAt + error. Idempotente: si ya está en
 *    un estado posterior (e.g. READ y llega delivered), no retrocede.
 *  - `messages[]`: mensaje entrante del usuario. Upsert
 *    `WapiConversation(teamId, configId, phone)` y crea `WapiMessage` con
 *    `metaMessageId` único. Renueva `lastMessageAt` y la ventana 24h.
 *
 * Multi-config: un mismo POST puede traer eventos de varios `phone_number_id`
 * (Meta batchea por App). Cada `value` se resuelve a su config correspondiente
 * y se procesa en su propio `TenantContext.run` para que el scoping de Prisma
 * sea correcto por entry.
 *
 * Idempotencia: las creaciones de `WapiMessage` van bajo `metaMessageId @unique`,
 * así que duplicados de Meta tiran P2002 silenciosamente.
 */
@Injectable()
export class WapiWebhookService {
  private readonly logger = new Logger(WapiWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async process(
    payload: WapiWebhookPayload,
    configByPhoneNumberId: Map<string, ResolvedWebhookConfig>,
  ): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const cfg = configByPhoneNumberId.get(phoneNumberId);
        if (!cfg) {
          this.logger.warn(
            `entry con phone_number_id=${phoneNumberId} sin config resuelto — skip`,
          );
          continue;
        }
        const ctx: RequestContext = {
          userId: 'system:wapi-webhook',
          organizationId: cfg.organizationId,
          teamId: cfg.teamId,
          orgRole: 'OWNER',
          teamRole: 'ADMIN',
        };
        await TenantContext.run(ctx, () => this.processValue(change.value, cfg));
      }
    }
  }

  private async processValue(value: WapiWebhookValue, tenant: ResolvedWebhookConfig): Promise<void> {
    if (Array.isArray(value.statuses)) {
      for (const st of value.statuses) {
        await this.handleStatus(st, tenant);
      }
    }
    if (Array.isArray(value.messages)) {
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const msg of value.messages) {
        await this.handleInboundMessage(msg, contactName, tenant);
      }
    }
  }

  private async handleStatus(st: WapiWebhookStatus, tenant: ResolvedWebhookConfig): Promise<void> {
    const report = await this.prisma.scoped.wapiReport.findFirst({
      where: { metaMessageId: st.id },
      select: { id: true, campaignId: true, status: true },
    });
    if (!report) {
      this.logger.warn(`status ${st.status} para metaMessageId=${st.id} sin WapiReport (team ${tenant.teamId})`);
      return;
    }

    const data: Record<string, unknown> = {};
    const tsMs = Number(st.timestamp) * 1000;
    const ts = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();

    switch (st.status) {
      case 'sent':
        // Ya marcamos SENT al recibir el ack del POST /messages — este status
        // es redundante pero confirma. No tocamos timestamps ni el status.
        return;
      case 'delivered':
        if (report.status === 'READ' || report.status === 'FAILED') return;
        data.status = 'DELIVERED';
        data.deliveredAt = ts;
        break;
      case 'read':
        if (report.status === 'FAILED') return;
        data.status = 'READ';
        data.readAt = ts;
        if (report.status !== 'DELIVERED') data.deliveredAt = ts;
        break;
      case 'failed': {
        const err = st.errors?.[0];
        const errMsg = err
          ? `${err.code}:${err.title}${err.message ? ` — ${err.message}` : ''}`
          : 'unknown failure';
        data.status = 'FAILED';
        data.failedAt = ts;
        data.error = errMsg.slice(0, 500);
        break;
      }
      default:
        this.logger.warn(`status desconocido: ${String(st.status)}`);
        return;
    }

    if (Object.keys(data).length === 0) return;
    await this.prisma.scoped.wapiReport.update({
      where: { id: report.id },
      data,
    });
    this.events.emitToTeamDebounced(
      tenant.teamId,
      'wapi.report.updated',
      report.campaignId,
      { campaignId: report.campaignId },
    );
  }

  private async handleInboundMessage(
    msg: WapiWebhookMessage,
    profileName: string | null,
    tenant: ResolvedWebhookConfig,
  ): Promise<void> {
    const phone = msg.from;
    const tsMs = Number(msg.timestamp) * 1000;
    const ts = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();

    const conversation = await this.prisma.scoped.wapiConversation.upsert({
      where: {
        teamId_configId_phone: {
          teamId: tenant.teamId,
          configId: tenant.configId,
          phone,
        },
      },
      create: {
        organizationId: tenant.organizationId,
        teamId: tenant.teamId,
        configId: tenant.configId,
        phone,
        name: profileName,
        lastMessageAt: ts,
        window24hAt: new Date(ts.getTime() + 24 * 60 * 60_000),
        unreadCount: 1,
      },
      update: {
        lastMessageAt: ts,
        window24hAt: new Date(ts.getTime() + 24 * 60 * 60_000),
        unreadCount: { increment: 1 },
        ...(profileName ? { name: profileName } : {}),
        // Si la conversación estaba RESOLVED y entra un mensaje nuevo, la
        // reabrimos automáticamente (mantiene assignedUserId si lo tenía).
        ...(await this.shouldReopen(tenant.teamId, tenant.configId, phone)),
      },
      select: { id: true, status: true, assignedUserId: true, unreadCount: true },
    });

    let createdMessageId: string | null = null;
    let storedContent: unknown = null;
    try {
      const created = await this.prisma.scoped.wapiMessage.create({
        data: {
          organizationId: tenant.organizationId,
          teamId: tenant.teamId,
          conversationId: conversation.id,
          metaMessageId: msg.id,
          fromMe: false,
          type: msg.type,
          content: extractContent(msg) as Prisma.InputJsonValue,
          status: 'received',
          timestamp: ts,
        },
        select: { id: true, content: true },
      });
      createdMessageId = created.id;
      storedContent = created.content;
    } catch (err) {
      // Duplicado por unique(metaMessageId) — Meta a veces re-envía. Log y seguir.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        this.logger.debug(`WapiMessage duplicado metaMessageId=${msg.id} — ignorado`);
        return;
      }
      throw err;
    }

    // Evento legacy (3.E inbound).
    this.events.emitToTeam(tenant.teamId, 'wapi.message.inbound', {
      conversationId: conversation.id,
      configId: tenant.configId,
      phone,
      type: msg.type,
      ts: ts.toISOString(),
    });

    // Eventos del inbox (4.F.3): el frontend usa estos para append a la lista
    // y a la conversación abierta sin necesidad de re-fetchear.
    this.events.emitToTeam(tenant.teamId, 'wapi.message.new', {
      conversationId: conversation.id,
      configId: tenant.configId,
      phone,
      message: {
        id: createdMessageId,
        fromMe: false,
        type: msg.type,
        content: storedContent,
        status: 'received',
        timestamp: ts.toISOString(),
        metaMessageId: msg.id,
      },
    });
    this.events.emitToTeam(tenant.teamId, 'wapi.conversation.updated', {
      id: conversation.id,
      configId: tenant.configId,
      phone,
      status: conversation.status,
      assignedUserId: conversation.assignedUserId,
      lastMessageAt: ts.toISOString(),
      unreadCount: conversation.unreadCount,
    });
  }

  /**
   * Si la conversación viene de RESOLVED, la reabrimos: ASSIGNED si tenía
   * dueño, UNASSIGNED si no. Devolvemos el patch para mergear en `update` del
   * upsert. Si no está RESOLVED, devolvemos {} y no toca status.
   */
  private async shouldReopen(
    teamId: string,
    configId: string,
    phone: string,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.scoped.wapiConversation.findFirst({
      where: { teamId, configId, phone },
      select: { status: true, assignedUserId: true },
    });
    if (!existing || existing.status !== 'RESOLVED') return {};
    return {
      status: existing.assignedUserId ? 'ASSIGNED' : 'UNASSIGNED',
      resolvedAt: null,
    };
  }
}

function extractContent(msg: WapiWebhookMessage): Record<string, unknown> {
  // Persistimos el sub-objeto del tipo + context cuando exista. El objeto raw
  // de Meta tiene mucho más detalle que sólo `text.body` — guardamos todo lo
  // útil para que el inbox lo renderice cuando se construya 4.F.
  const content: Record<string, unknown> = {};
  const passthroughKeys = [
    'text',
    'image',
    'audio',
    'video',
    'document',
    'sticker',
    'button',
    'interactive',
    'reaction',
  ] as const;
  for (const k of passthroughKeys) {
    const v = (msg as unknown as Record<string, unknown>)[k];
    if (v !== undefined) content[k] = v;
  }
  if (msg.context) content.context = msg.context;
  return content;
}
