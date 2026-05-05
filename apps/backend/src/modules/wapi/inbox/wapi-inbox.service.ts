import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import {
  WapiSendException,
  type SendTextInput,
} from '../sender/wapi-sender.types';
import type {
  AssignWapiConversationDto,
  InboxTab,
  ListWapiConversationsQueryDto,
  ListWapiMessagesQueryDto,
  ResolveWapiConversationDto,
  SendWapiInboxTextDto,
} from './wapi-inbox.dto';

const DEFAULT_LIST_LIMIT = 30;
const DEFAULT_MESSAGES_LIMIT = 50;

export interface ConversationListItem {
  id: string;
  configId: string;
  phone: string;
  name: string | null;
  status: string;
  assignedUserId: string | null;
  lastMessageAt: Date | null;
  window24hAt: Date | null;
  unreadCount: number;
  campaignName: string | null;
  resolvedAt: Date | null;
  lastMessage: {
    fromMe: boolean;
    type: string;
    preview: string;
    timestamp: Date;
  } | null;
}

export interface MessagePayload {
  id: string;
  fromMe: boolean;
  type: string;
  content: unknown;
  status: string;
  timestamp: Date;
  metaMessageId: string | null;
}

@Injectable()
export class WapiInboxService {
  private readonly logger = new Logger(WapiInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WapiSenderService,
    private readonly events: EventsService,
    private readonly encryption: EncryptionService,
  ) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para inbox WhatsApp');
    }
    return ctx;
  }

  async listConversations(query: ListWapiConversationsQueryDto): Promise<{
    items: ConversationListItem[];
    nextCursor: string | null;
  }> {
    const ctx = this.requireContext();
    const tab: InboxTab = query.tab ?? 'all';
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;

    const where: Record<string, unknown> = {};
    if (query.configId) where.configId = query.configId;

    switch (tab) {
      case 'mine':
        where.assignedUserId = ctx.userId;
        where.status = { in: ['ASSIGNED'] };
        break;
      case 'unassigned':
        where.status = 'UNASSIGNED';
        break;
      case 'others':
        where.status = 'ASSIGNED';
        where.assignedUserId = { not: ctx.userId };
        break;
      case 'resolved':
        where.status = 'RESOLVED';
        break;
      case 'all':
      default:
        where.status = { in: ['UNASSIGNED', 'ASSIGNED'] };
        break;
    }

    if (query.search) {
      const term = query.search.trim();
      if (term.length > 0) {
        where.OR = [
          { phone: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const rows = await this.prisma.scoped.wapiConversation.findMany({
      where: where as never,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: {
            fromMe: true,
            type: true,
            content: true,
            timestamp: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    const sliced = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];
    if (rows.length > limit && last) {
      nextCursor = last.id;
    }

    const items: ConversationListItem[] = sliced.map((row) => {
      const last = row.messages[0];
      return {
        id: row.id,
        configId: row.configId,
        phone: row.phone,
        name: row.name,
        status: row.status,
        assignedUserId: row.assignedUserId,
        lastMessageAt: row.lastMessageAt,
        window24hAt: row.window24hAt,
        unreadCount: row.unreadCount,
        campaignName: row.campaignName,
        resolvedAt: row.resolvedAt,
        lastMessage: last
          ? {
              fromMe: last.fromMe,
              type: last.type,
              preview: extractPreview(last.type, last.content),
              timestamp: last.timestamp,
            }
          : null,
      };
    });

    return { items, nextCursor };
  }

  async getConversation(id: string): Promise<ConversationListItem & {
    createdAt: Date;
    updatedAt: Date;
  }> {
    this.requireContext();
    const row = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: {
            fromMe: true,
            type: true,
            content: true,
            timestamp: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Conversación ${id} no encontrada`);
    const last = row.messages[0];
    return {
      id: row.id,
      configId: row.configId,
      phone: row.phone,
      name: row.name,
      status: row.status,
      assignedUserId: row.assignedUserId,
      lastMessageAt: row.lastMessageAt,
      window24hAt: row.window24hAt,
      unreadCount: row.unreadCount,
      campaignName: row.campaignName,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessage: last
        ? {
            fromMe: last.fromMe,
            type: last.type,
            preview: extractPreview(last.type, last.content),
            timestamp: last.timestamp,
          }
        : null,
    };
  }

  async listMessages(
    conversationId: string,
    query: ListWapiMessagesQueryDto,
  ): Promise<{ items: MessagePayload[]; nextCursor: string | null }> {
    this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);

    const limit = query.limit ?? DEFAULT_MESSAGES_LIMIT;
    const where: Record<string, unknown> = { conversationId };
    if (query.cursor) where.id = { lt: query.cursor };

    const rows = await this.prisma.scoped.wapiMessage.findMany({
      where: where as never,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    const sliced = rows.length > limit ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];
    if (rows.length > limit && last) {
      nextCursor = last.id;
    }

    const items: MessagePayload[] = sliced.map((row) => ({
      id: row.id,
      fromMe: row.fromMe,
      type: row.type,
      content: row.content,
      status: row.status,
      timestamp: row.timestamp,
      metaMessageId: row.metaMessageId,
    }));

    return { items, nextCursor };
  }

  async sendText(conversationId: string, dto: SendWapiInboxTextDto): Promise<MessagePayload> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede responder una conversación resuelta — reabrila primero');
    }

    const window24hAt = conv.window24hAt;
    if (!window24hAt || window24hAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ventana de 24h cerrada — sólo se puede responder con plantilla. Iniciá una campaña con template.',
      );
    }

    const cfg = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: conv.configId },
    });
    if (!cfg) throw new ConflictException('La config WhatsApp asociada ya no existe');
    if (!cfg.isActive) throw new ConflictException('La config WhatsApp está deshabilitada');

    const sendInput: SendTextInput = {
      to: conv.phone,
      body: dto.body,
      previewUrl: dto.previewUrl ?? false,
    };

    let metaMessageId: string;
    try {
      const result = await this.sender.sendText(
        {
          phoneNumberId: cfg.phoneNumberId,
          accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
        },
        sendInput,
      );
      metaMessageId = result.metaMessageId;
    } catch (err) {
      if (err instanceof WapiSendException) {
        throw new BadRequestException(`Meta API: ${err.detail.message}`);
      }
      throw err;
    }

    const ts = new Date();
    const message = await this.prisma.scoped.wapiMessage.create({
      data: {
        conversationId: conv.id,
        metaMessageId,
        fromMe: true,
        type: 'text',
        content: { text: { body: dto.body } } as Prisma.InputJsonValue,
        status: 'sent',
        timestamp: ts,
      } as never,
    });

    const becomesAssigned = conv.status === 'UNASSIGNED' && !conv.assignedUserId;
    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: ts,
        firstReplyAt: conv.firstReplyAt ?? ts,
        ...(becomesAssigned
          ? { status: 'ASSIGNED', assignedUserId: ctx.userId }
          : {}),
      } as never,
    });

    this.events.emitToTeam(ctx.teamId, 'wapi.message.new', {
      conversationId: conv.id,
      configId: conv.configId,
      message: {
        id: message.id,
        fromMe: true,
        type: 'text',
        content: message.content,
        status: 'sent',
        timestamp: ts.toISOString(),
        metaMessageId,
      },
    });
    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
    });

    return {
      id: message.id,
      fromMe: true,
      type: 'text',
      content: message.content,
      status: 'sent',
      timestamp: ts,
      metaMessageId,
    };
  }

  async setReadState(conversationId: string, read: boolean): Promise<{ unreadCount: number }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);

    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: read
        ? { unreadCount: 0, lastReadAt: new Date() }
        : { unreadCount: 1 },
      select: { unreadCount: true },
    });

    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: conv.id,
      unreadCount: updated.unreadCount,
    });
    return { unreadCount: updated.unreadCount };
  }

  async take(conversationId: string): Promise<{ id: string; assignedUserId: string }> {
    const ctx = this.requireContext();
    return this.assign(conversationId, ctx.userId);
  }

  async assign(conversationId: string, userId: string): Promise<{ id: string; assignedUserId: string }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede asignar una conversación resuelta');
    }
    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: {
        assignedUserId: userId,
        status: 'ASSIGNED',
      } as never,
      select: { id: true, assignedUserId: true, status: true },
    });
    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
    });
    return { id: updated.id, assignedUserId: updated.assignedUserId! };
  }

  async unassign(conversationId: string): Promise<{ id: string }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede dejar libre una conversación resuelta');
    }
    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: { assignedUserId: null, status: 'UNASSIGNED' } as never,
      select: { id: true, status: true, assignedUserId: true },
    });
    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
    });
    return { id: updated.id };
  }

  async resolve(
    conversationId: string,
    dto: ResolveWapiConversationDto,
  ): Promise<{ id: string; resolvedAt: Date }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('La conversación ya está resuelta');
    }

    const resolvedAt = new Date();
    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: { status: 'RESOLVED', resolvedAt } as never,
      select: { id: true, resolvedAt: true, status: true, assignedUserId: true },
    });

    if (dto.note && dto.note.trim()) {
      await this.prisma.scoped.wapiResolutionNote.create({
        data: {
          conversationId: conv.id,
          authorUserId: ctx.userId,
          note: dto.note.trim(),
        } as never,
      });
    }

    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    });
    return { id: updated.id, resolvedAt: updated.resolvedAt! };
  }

  async reopen(conversationId: string): Promise<{ id: string }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true, assignedUserId: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status !== 'RESOLVED') {
      throw new ConflictException('Sólo se reabren conversaciones resueltas');
    }
    const nextStatus = conv.assignedUserId ? 'ASSIGNED' : 'UNASSIGNED';
    const updated = await this.prisma.scoped.wapiConversation.update({
      where: { id: conv.id },
      data: { status: nextStatus, resolvedAt: null } as never,
      select: { id: true, status: true, assignedUserId: true },
    });
    this.events.emitToTeam(ctx.teamId, 'wapi.conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      resolvedAt: null,
    });
    return { id: updated.id };
  }

  async listResolutionNotes(conversationId: string): Promise<
    Array<{ id: string; note: string; authorUserId: string | null; createdAt: Date }>
  > {
    this.requireContext();
    const conv = await this.prisma.scoped.wapiConversation.findFirst({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    const rows = await this.prisma.scoped.wapiResolutionNote.findMany({
      where: { conversationId } as never,
      orderBy: { createdAt: 'desc' },
      select: { id: true, note: true, authorUserId: true, createdAt: true },
    });
    return rows;
  }

  async assignDto(
    conversationId: string,
    dto: AssignWapiConversationDto,
  ): Promise<{ id: string; assignedUserId: string }> {
    return this.assign(conversationId, dto.userId);
  }
}

function extractPreview(type: string, content: unknown): string {
  if (!content || typeof content !== 'object') return labelFor(type);
  const c = content as Record<string, unknown>;
  if (type === 'text') {
    const text = (c.text as { body?: string } | undefined)?.body;
    return text ?? '';
  }
  const sub = c[type] as Record<string, unknown> | undefined;
  if (sub) {
    const caption = sub.caption as string | undefined;
    if (caption) return caption;
    const filename = sub.filename as string | undefined;
    if (filename) return filename;
    const body = sub.body as string | undefined;
    if (body) return body;
  }
  return labelFor(type);
}

function labelFor(type: string): string {
  switch (type) {
    case 'image':
      return '📷 Imagen';
    case 'audio':
      return '🎤 Audio';
    case 'video':
      return '🎬 Video';
    case 'document':
      return '📄 Documento';
    case 'sticker':
      return 'Sticker';
    case 'location':
      return '📍 Ubicación';
    case 'contacts':
      return '👤 Contacto';
    case 'reaction':
      return 'Reacción';
    case 'interactive':
      return 'Interactivo';
    default:
      return type;
  }
}
