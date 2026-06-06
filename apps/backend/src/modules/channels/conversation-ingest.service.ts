import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EventsService } from '../events/events.service';
import { BotEngineService } from '../bot/bot-engine.service';
import { BotFeatureService } from '../bot/bot-feature.service';
import type { ChannelKind, InboundMessage } from './adapter.types';

/** Canal resuelto (+ relación bot) que el ingest necesita para persistir y, si
 *  corresponde, pasar el inbound por el motor del bot. */
export interface IngestChannel {
  id: string;
  organizationId: string;
  teamId: string;
  kind: ChannelKind;
  accessTokenEnc: string;
  isTestMode: boolean;
  phoneNumberId: string | null;
  pageId: string | null;
  bot: {
    enabled: boolean;
    flow: unknown;
    sessionTtlMin: number;
    topics: unknown;
    router: unknown;
    variables: unknown;
  } | null;
}

const WINDOW_24H_MS = 24 * 60 * 60_000;

/**
 * Fase 2 — Ingesta de inbound **agnóstica de canal**. Consume `InboundMessage[]`
 * (producidos por `adapter.parseInbound`) y hace lo mismo que el path de WhatsApp
 * pero sin acoplarse al payload de Meta:
 *  - upsert `Conversation` por (channelId, externalUserId) con `channelKind`,
 *  - crea `Message` (idempotente por `[channelId, externalId]`),
 *  - emite los eventos del inbox (`conversation.message.new` / `conversation.updated`),
 *  - si el canal tiene bot enabled (y no está suspendido), pasa el inbound por el
 *    motor; en HANDOFF el motor ya escala (escalated=true) y acá emitimos el
 *    update + priority (paridad con el webhook de WhatsApp).
 *
 * WhatsApp sigue por `WapiWebhookService.process` (su lógica de welcome/opt-out/
 * button-actions/media-download es WhatsApp-template-específica). Este ingest sirve
 * a Messenger (y luego Instagram/Webchat). La consolidación de ambos paths queda
 * para un cleanup futuro.
 */
@Injectable()
export class ConversationIngestService {
  private readonly logger = new Logger(ConversationIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly botFeature: BotFeatureService,
    private readonly botEngine: BotEngineService,
  ) {}

  async ingest(channel: IngestChannel, inbounds: InboundMessage[]): Promise<void> {
    for (const inbound of inbounds) {
      try {
        await this.ingestOne(channel, inbound);
      } catch (err) {
        this.logger.warn(
          `ingest falló channel=${channel.id} ext=${inbound.externalUserId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async ingestOne(channel: IngestChannel, inbound: InboundMessage): Promise<void> {
    const ts = inbound.timestamp ?? new Date();
    const externalUserId = inbound.externalUserId;
    const profileName = inbound.senderProfile?.name;

    // 1. Upsert Conversation. findFirst+create/update (vs upsert) para detectar
    //    primera conversación. El unique (teamId, channelId, externalUserId) cubre
    //    el race entre dos webhooks simultáneos → P2002 → refetch.
    const existing = await this.prisma.scoped.conversation.findFirst({
      where: { channelId: channel.id, externalUserId },
      select: { id: true, status: true, assignedUserId: true, unreadCount: true },
    });
    let conversation: { id: string; status: string; assignedUserId: string | null; unreadCount: number };
    if (existing) {
      const waitingTransition =
        existing.status === 'WAITING' ? { status: 'UNASSIGNED', waitingUntil: null } : {};
      conversation = await this.prisma.scoped.conversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: ts,
          freeformWindowAt: new Date(ts.getTime() + WINDOW_24H_MS),
          unreadCount: { increment: 1 },
          ...(profileName ? { name: profileName } : {}),
          ...waitingTransition,
        } as never,
        select: { id: true, status: true, assignedUserId: true, unreadCount: true },
      });
    } else {
      try {
        conversation = await this.prisma.scoped.conversation.create({
          data: {
            organizationId: channel.organizationId,
            teamId: channel.teamId,
            channelId: channel.id,
            channelKind: channel.kind,
            externalUserId,
            name: profileName,
            lastMessageAt: ts,
            freeformWindowAt: new Date(ts.getTime() + WINDOW_24H_MS),
            unreadCount: 1,
          } as never,
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const refetched = await this.prisma.scoped.conversation.findFirst({
          where: { channelId: channel.id, externalUserId },
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
        if (!refetched) throw err;
        conversation = refetched;
      }
    }

    // 2. Persistir el Message (idempotente por [channelId, externalId]).
    const type = persistType(inbound.type);
    const content = buildContent(inbound);
    let createdMessageId: string;
    let storedContent: unknown;
    try {
      const created = await this.prisma.scoped.message.create({
        data: {
          conversationId: conversation.id,
          channelId: channel.id,
          externalId: inbound.externalMessageId,
          fromMe: false,
          type,
          content: content as Prisma.InputJsonValue,
          status: 'received',
          timestamp: ts,
        } as never,
        select: { id: true, content: true },
      });
      createdMessageId = created.id;
      storedContent = created.content;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.debug(`Message duplicado externalId=${inbound.externalMessageId} — ignorado`);
        return;
      }
      throw err;
    }

    // 3. Eventos del inbox.
    this.events.emitToTeam(channel.teamId, 'conversation.message.new', {
      conversationId: conversation.id,
      channelId: channel.id,
      channelKind: channel.kind,
      externalUserId,
      message: {
        id: createdMessageId,
        fromMe: false,
        type,
        content: storedContent,
        status: 'received',
        timestamp: ts.toISOString(),
        externalId: inbound.externalMessageId,
      },
    });
    this.events.emitToTeam(channel.teamId, 'conversation.updated', {
      id: conversation.id,
      channelId: channel.id,
      channelKind: channel.kind,
      externalUserId,
      status: conversation.status,
      assignedUserId: conversation.assignedUserId,
      lastMessageAt: ts.toISOString(),
      unreadCount: conversation.unreadCount,
    });

    // 4. Bot guiado. Sólo texto / quick-reply (button). El motor chequea
    //    internamente botSuspended y feature flag, pero acortamos antes.
    await this.maybeRunBot(channel, conversation.id, externalUserId, inbound);
  }

  private async maybeRunBot(
    channel: IngestChannel,
    conversationId: string,
    externalUserId: string,
    inbound: InboundMessage,
  ): Promise<void> {
    const bot = channel.bot;
    if (!bot?.enabled || !(bot.topics || bot.flow)) return;
    if (!(await this.botFeature.isEnabled())) return;

    const botInbound =
      inbound.type === 'interactive_reply' && inbound.interactiveReplyId
        ? { kind: 'button' as const, buttonId: inbound.interactiveReplyId, contextMetaMessageId: null }
        : typeof inbound.text === 'string'
          ? { kind: 'text' as const, body: inbound.text }
          : null;
    if (!botInbound) return;

    const result = await this.botEngine.handle(
      {
        id: channel.id,
        kind: channel.kind,
        phoneNumberId: channel.phoneNumberId,
        pageId: channel.pageId,
        accessTokenEnc: channel.accessTokenEnc,
        isTestMode: channel.isTestMode,
        botEnabled: bot.enabled,
        botFlow: bot.flow,
        botSessionTtlMin: bot.sessionTtlMin,
        botTopics: bot.topics,
        botRouter: bot.router,
        botVariables: bot.variables,
      },
      { configId: channel.id, conversationId, phone: externalUserId, inbound: botInbound },
    );

    // HANDOFF: el motor ya marcó escalated=true; acá marcamos priority + empujamos
    // el update al inbox (paridad con el webhook de WhatsApp).
    if (result.ended && result.escalate) {
      try {
        const updated = await this.prisma.scoped.conversation.update({
          where: { id: conversationId },
          data: { priority: true } as never,
          select: {
            id: true, status: true, assignedUserId: true, lastMessageAt: true,
            unreadCount: true, priority: true,
          } as never,
        });
        const u = updated as unknown as {
          id: string; status: string; assignedUserId: string | null;
          lastMessageAt: Date | null; unreadCount: number; priority: boolean;
        };
        this.events.emitToTeam(channel.teamId, 'conversation.updated', {
          id: u.id,
          channelId: channel.id,
          channelKind: channel.kind,
          externalUserId,
          status: u.status,
          assignedUserId: u.assignedUserId,
          lastMessageAt: u.lastMessageAt?.toISOString() ?? null,
          unreadCount: u.unreadCount,
          priority: u.priority,
        });
      } catch (err) {
        this.logger.warn(`Bot HANDOFF escalate falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

/** Mapea el tipo normalizado del inbound al `Message.type` persistido. */
function persistType(t: InboundMessage['type']): string {
  switch (t) {
    case 'interactive_reply':
      return 'text';
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'location':
      return t;
    default:
      return 'text';
  }
}

/** Construye el `content` JSON del mensaje a partir del inbound normalizado. */
function buildContent(inbound: InboundMessage): Record<string, unknown> {
  if (inbound.type === 'text' || inbound.type === 'interactive_reply') {
    return { text: { body: inbound.text ?? '' } };
  }
  if (inbound.media) {
    const media: Record<string, unknown> = {};
    if (inbound.media.url) media.url = inbound.media.url;
    if (inbound.media.id) media.id = inbound.media.id;
    if (inbound.media.caption) media.caption = inbound.media.caption;
    if (inbound.media.filename) media.filename = inbound.media.filename;
    return { [persistType(inbound.type)]: media };
  }
  return { text: { body: inbound.text ?? '' } };
}
