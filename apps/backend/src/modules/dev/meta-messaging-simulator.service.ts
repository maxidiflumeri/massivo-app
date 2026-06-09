import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { MetaMessagingAdapter } from '../channels/adapters/meta-messaging.adapter';
import type { ChannelKind } from '../channels/adapter.types';
import {
  ConversationIngestService,
  type IngestChannel,
} from '../channels/conversation-ingest.service';

const INGEST_CHANNEL_SELECT = {
  id: true,
  organizationId: true,
  teamId: true,
  kind: true,
  accessTokenEnc: true,
  isTestMode: true,
  phoneNumberId: true,
  pageId: true,
  bot: {
    select: { enabled: true, flow: true, sessionTtlMin: true, topics: true, router: true, variables: true },
  },
  agent: {
    select: { id: true, enabled: true, model: true, systemPrompt: true, temperature: true, maxSteps: true },
  },
} as const;

/**
 * 4.L (extendido a Meta Messaging) — Base del simulador de inbound para dev.
 * Messenger e Instagram comparten el flujo: crear un Channel de test en modo test e
 * inyectar eventos del envelope Meta (`object: page|instagram`, `entry[].messaging[]`)
 * directo en el `ConversationIngestService`, saltando HMAC y la URL pública del
 * webhook. En modo test el envío del bot tampoco pega a Meta (SIM id). Las subclases
 * sólo fijan el kind, el `object` y el adapter del proveedor. Sólo activo con
 * `ENABLE_DEV_SIMULATOR=true` (guard en el controller).
 */
export abstract class MetaMessagingSimulatorService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly encryption: EncryptionService,
    protected readonly ingest: ConversationIngestService,
    /** Adapter del proveedor (Messenger/Instagram); ambos extienden la base Meta. */
    protected readonly adapter: MetaMessagingAdapter,
    protected readonly kind: ChannelKind,
    /** `payload.object` del envelope (Messenger 'page', IG 'instagram'). */
    protected readonly webhookObject: string,
    /** Nombre por defecto del canal de test ('Messenger (test)' / 'Instagram (test)'). */
    protected readonly defaultName: string,
    /** Prefijo del id externo de test por defecto ('PAGE' / 'IG'). */
    protected readonly idPrefix: string,
  ) {}

  private requireCtx() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('Sin contexto de tenant');
    return ctx;
  }

  /** Crea (o devuelve) un Channel de test del kind para el tenant actual,
   *  opcionalmente conectado a un bot. `pageId` reusa la columna como id externo
   *  (page id para Messenger / IG account id para Instagram). */
  async ensureTestChannel(input: { pageId?: string; botId?: string; name?: string }): Promise<{
    id: string;
    pageId: string;
    botId: string | null;
  }> {
    const ctx = this.requireCtx();
    const pageId = input.pageId?.trim() || `${this.idPrefix}_TEST_${ctx.teamId}`;
    const existing = await this.prisma.scoped.channel.findFirst({
      where: { kind: this.kind, pageId } as never,
      select: { id: true, botId: true },
    });
    if (existing) {
      if (input.botId && existing.botId !== input.botId) {
        await this.prisma.scoped.channel.update({
          where: { id: existing.id },
          data: { botId: input.botId } as never,
        });
      }
      return { id: existing.id, pageId, botId: input.botId ?? existing.botId };
    }
    const created = await this.prisma.scoped.channel.create({
      data: {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        kind: this.kind,
        name: input.name?.trim() || this.defaultName,
        pageId,
        phoneNumberId: null,
        businessAccountId: '',
        accessTokenEnc: this.encryption.encrypt('test-page-token'),
        webhookVerifyTokenEnc: this.encryption.encrypt('test-verify-token'),
        appSecretEnc: null,
        isActive: true,
        isTestMode: true,
        ...(input.botId ? { botId: input.botId } : {}),
      } as never,
      select: { id: true, botId: true },
    });
    this.logger.log(`${this.kind} test channel creado id=${created.id} pageId=${pageId} bot=${created.botId ?? 'none'}`);
    return { id: created.id, pageId, botId: created.botId };
  }

  /** Simula un inbound (texto o quick reply) hacia un Channel test del kind. */
  async simulateInbound(input: {
    channelId: string;
    psid: string;
    text?: string;
    quickReplyPayload?: string;
  }): Promise<{ ok: true; mid: string }> {
    this.requireCtx();
    const channel = (await this.prisma.scoped.channel.findFirst({
      where: { id: input.channelId, kind: this.kind } as never,
      select: INGEST_CHANNEL_SELECT as never,
    })) as IngestChannel | null;
    if (!channel) throw new NotFoundException(`Channel ${this.kind} ${input.channelId} no encontrado`);

    const mid = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const message: Record<string, unknown> = { mid };
    if (input.quickReplyPayload) {
      message.text = input.text ?? '';
      message.quick_reply = { payload: input.quickReplyPayload };
    } else {
      message.text = input.text ?? '';
    }
    const payload = {
      object: this.webhookObject,
      entry: [
        {
          id: channel.pageId,
          messaging: [
            {
              sender: { id: input.psid },
              recipient: { id: channel.pageId },
              timestamp: Date.now(),
              message,
            },
          ],
        },
      ],
    };
    const inbounds = this.adapter.parseInbound(payload);
    await this.ingest.ingest(channel, inbounds);
    return { ok: true, mid };
  }
}
