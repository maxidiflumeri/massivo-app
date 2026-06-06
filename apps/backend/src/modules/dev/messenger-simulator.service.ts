import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { MessengerAdapter } from '../channels/adapters/messenger.adapter';
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
} as const;

/**
 * 4.L (extendido a Messenger) — Simulador de inbound de Messenger para dev. Crea
 * un Channel MESSENGER en modo test y inyecta eventos `page`-shaped directo en el
 * `ConversationIngestService`, saltando HMAC y la URL pública del webhook. En modo
 * test el envío del bot tampoco pega a Meta (SIM id). Sólo activo con
 * `ENABLE_DEV_SIMULATOR=true` (guard en el controller).
 */
@Injectable()
export class MessengerSimulatorService {
  private readonly logger = new Logger(MessengerSimulatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly adapter: MessengerAdapter,
    private readonly ingest: ConversationIngestService,
  ) {}

  private requireCtx() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('Sin contexto de tenant');
    return ctx;
  }

  /** Crea (o devuelve) un Channel MESSENGER de test para el tenant actual,
   *  opcionalmente conectado a un bot. */
  async ensureTestChannel(input: { pageId?: string; botId?: string; name?: string }): Promise<{
    id: string;
    pageId: string;
    botId: string | null;
  }> {
    const ctx = this.requireCtx();
    const pageId = input.pageId?.trim() || `PAGE_TEST_${ctx.teamId}`;
    const existing = await this.prisma.scoped.channel.findFirst({
      where: { kind: 'MESSENGER', pageId } as never,
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
        kind: 'MESSENGER',
        name: input.name?.trim() || 'Messenger (test)',
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
    this.logger.log(`Messenger test channel creado id=${created.id} pageId=${pageId} bot=${created.botId ?? 'none'}`);
    return { id: created.id, pageId, botId: created.botId };
  }

  /** Simula un inbound de Messenger (texto o quick reply) hacia un Channel test. */
  async simulateInbound(input: {
    channelId: string;
    psid: string;
    text?: string;
    quickReplyPayload?: string;
  }): Promise<{ ok: true; mid: string }> {
    this.requireCtx();
    const channel = (await this.prisma.scoped.channel.findFirst({
      where: { id: input.channelId, kind: 'MESSENGER' } as never,
      select: INGEST_CHANNEL_SELECT as never,
    })) as IngestChannel | null;
    if (!channel) throw new NotFoundException(`Channel MESSENGER ${input.channelId} no encontrado`);

    const mid = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const message: Record<string, unknown> = { mid };
    if (input.quickReplyPayload) {
      message.text = input.text ?? '';
      message.quick_reply = { payload: input.quickReplyPayload };
    } else {
      message.text = input.text ?? '';
    }
    const payload = {
      object: 'page',
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
