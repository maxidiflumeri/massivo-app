import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EncryptionService } from '../../common/security/encryption.service';
import { EventsService } from '../events/events.service';
import { WhatsAppAdapter } from '../channels/adapters/whatsapp.adapter';
import { WapiSendException } from '../wapi/sender/wapi-sender.types';
import { WapiMediaService } from '../wapi/media/wapi-media.service';
import { BotEngineService } from '../bot/bot-engine.service';
import {
  WapiMediaException,
  type WapiMediaType,
} from '../wapi/media/wapi-media.types';
import type {
  AssignConversationDto,
  InboxTab,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  ResolveConversationDto,
  SendInboxMediaDto,
  SendInboxTextDto,
} from './inbox.dto';

const DEFAULT_LIST_LIMIT = 30;
const DEFAULT_MESSAGES_LIMIT = 50;

export interface ConversationListItem {
  id: string;
  channelId: string;
  channelKind: string;
  externalUserId: string;
  name: string | null;
  status: string;
  assignedUserId: string | null;
  lastMessageAt: Date | null;
  freeformWindowAt: Date | null;
  unreadCount: number;
  campaignName: string | null;
  resolvedAt: Date | null;
  priority: boolean;
  // 4.O.6 — bot suspension + WAITING.
  waitingUntil: Date | null;
  lastAssignedUserId: string | null;
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
  externalId: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly events: EventsService,
    private readonly encryption: EncryptionService,
    private readonly media: WapiMediaService,
    private readonly botEngine: BotEngineService,
  ) {}

  /**
   * Cierra cualquier sesión de bot activa para esta conversación. Llamado
   * desde assign/take/resolve para evitar que el bot siga respondiendo cuando
   * un operador ya tomó la cuerda. Best-effort.
   */
  private async endBotSessionsFor(conversationId: string, reason: string): Promise<void> {
    try {
      const conv = await this.prisma.scoped.conversation.findFirst({
        where: { id: conversationId },
        select: { channelId: true, externalUserId: true },
      });
      if (conv) await this.botEngine.endSessionsForConversation(conv.channelId, conv.externalUserId, reason);
    } catch {
      // best-effort
    }
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para el inbox');
    }
    return ctx;
  }

  async listConversations(query: ListConversationsQueryDto): Promise<{
    items: ConversationListItem[];
    nextCursor: string | null;
  }> {
    const ctx = this.requireContext();
    const tab: InboxTab = query.tab ?? 'all';
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;

    const where: Record<string, unknown> = {};
    // Filtro por canal puntual (una línea/Channel).
    if (query.channelId) where.channelId = query.channelId;
    // Filtro por tipo de canal (omnicanal). Dormido mientras haya un solo kind.
    if (query.channelKind) where.channelKind = query.channelKind;
    if (query.priority) where.priority = true;

    // 4.O.6 — el inbox sólo muestra conversaciones escaladas. Las que están
    // siendo atendidas por el bot (escalated=false) no son visibles para
    // operadores ni admins; aparecen recién cuando el bot llega a HANDOFF
    // o el cliente toca el botón INBOX de un template.
    // `includeBotHandled` (Chat simulado de dev) levanta el filtro para poder
    // ver la conversación + respuestas del bot aunque no haya escalado.
    if (!query.includeBotHandled) where.escalated = true;

    let mineOrWaiting: Array<Record<string, unknown>> | null = null;
    switch (tab) {
      case 'mine':
        // 4.O.6 — `mine` agrupa lo que el operador "tiene": asignado activo
        // y WAITING (puesto en espera). El frontend separa con sub-tabs por
        // status. Usamos lastAssignedUserId para WAITING porque el flag
        // assignedUserId se libera al poner en espera.
        mineOrWaiting = [
          { status: 'ASSIGNED', assignedUserId: ctx.userId },
          { status: 'WAITING', lastAssignedUserId: ctx.userId },
        ];
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
        where.status = { in: ['UNASSIGNED', 'ASSIGNED', 'WAITING'] };
        break;
    }

    let searchOr: Array<Record<string, unknown>> | null = null;
    if (query.search) {
      const term = query.search.trim();
      if (term.length > 0) {
        searchOr = [
          { externalUserId: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    // Combinar dos posibles ORs (mine y search) usando AND para que ninguno se pise.
    if (mineOrWaiting && searchOr) {
      where.AND = [{ OR: mineOrWaiting }, { OR: searchOr }];
    } else if (mineOrWaiting) {
      where.OR = mineOrWaiting;
    } else if (searchOr) {
      where.OR = searchOr;
    }

    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const rows = await this.prisma.scoped.conversation.findMany({
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
      const r = row as unknown as { waitingUntil: Date | null; lastAssignedUserId: string | null };
      return {
        id: row.id,
        channelId: row.channelId,
        channelKind: row.channelKind,
        externalUserId: row.externalUserId,
        name: row.name,
        status: row.status,
        assignedUserId: row.assignedUserId,
        lastMessageAt: row.lastMessageAt,
        freeformWindowAt: row.freeformWindowAt,
        unreadCount: row.unreadCount,
        campaignName: row.campaignName,
        resolvedAt: row.resolvedAt,
        priority: row.priority,
        waitingUntil: r.waitingUntil,
        lastAssignedUserId: r.lastAssignedUserId,
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
    const row = await this.prisma.scoped.conversation.findFirst({
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
    const r = row as unknown as { waitingUntil: Date | null; lastAssignedUserId: string | null };
    return {
      id: row.id,
      channelId: row.channelId,
      channelKind: row.channelKind,
      externalUserId: row.externalUserId,
      name: row.name,
      status: row.status,
      assignedUserId: row.assignedUserId,
      lastMessageAt: row.lastMessageAt,
      freeformWindowAt: row.freeformWindowAt,
      unreadCount: row.unreadCount,
      campaignName: row.campaignName,
      resolvedAt: row.resolvedAt,
      priority: row.priority,
      waitingUntil: r.waitingUntil,
      lastAssignedUserId: r.lastAssignedUserId,
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
    query: ListMessagesQueryDto,
  ): Promise<{ items: MessagePayload[]; nextCursor: string | null }> {
    this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);

    const limit = query.limit ?? DEFAULT_MESSAGES_LIMIT;
    const where: Record<string, unknown> = { conversationId };
    if (query.cursor) where.id = { lt: query.cursor };

    const rows = await this.prisma.scoped.message.findMany({
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
      externalId: row.externalId,
      mediaMime: row.mediaMime,
      mediaSize: row.mediaSize,
      mediaFilename: row.mediaFilename,
      mediaCaption: row.mediaCaption,
    }));

    return { items, nextCursor };
  }

  async sendText(conversationId: string, dto: SendInboxTextDto): Promise<MessagePayload> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede responder una conversación resuelta — reabrila primero');
    }

    // Fase 1b — guard de ventana de freeform dirigido por la capability del canal.
    // WhatsApp la aplica (24h); canales sin ventana (ej. webchat) la saltean.
    const freeformWindowAt = conv.freeformWindowAt;
    if (
      this.whatsapp.capabilities.freeformWindow.enforced &&
      (!freeformWindowAt || freeformWindowAt.getTime() < Date.now())
    ) {
      throw new BadRequestException(
        'Ventana de 24h cerrada — sólo se puede responder con plantilla. Iniciá una campaña con template.',
      );
    }

    const cfg = await this.prisma.scoped.channel.findFirst({
      where: { id: conv.channelId },
    });
    if (!cfg) throw new ConflictException('El canal asociado ya no existe');
    if (!cfg.isActive) throw new ConflictException('El canal está deshabilitado');

    let externalId: string;
    try {
      // Fase 1b — envío vía WhatsAppAdapter (capa de canal).
      const result = await this.whatsapp.send(
        {
          phoneNumberId: cfg.phoneNumberId!,
          accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
          isTestMode: cfg.isTestMode,
        },
        { kind: 'text', to: conv.externalUserId, text: dto.body, previewUrl: dto.previewUrl ?? false },
      );
      externalId = result.externalMessageId;
    } catch (err) {
      if (err instanceof WapiSendException) {
        throw new BadRequestException(`Meta API: ${err.detail.message}`);
      }
      throw err;
    }

    const ts = new Date();
    const message = await this.prisma.scoped.message.create({
      data: {
        conversationId: conv.id,
        channelId: conv.channelId,
        externalId,
        fromMe: true,
        type: 'text',
        content: { text: { body: dto.body } } as Prisma.InputJsonValue,
        status: 'sent',
        timestamp: ts,
      } as never,
    });

    const becomesAssigned = conv.status === 'UNASSIGNED' && !conv.assignedUserId;
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: ts,
        firstReplyAt: conv.firstReplyAt ?? ts,
        ...(becomesAssigned
          ? { status: 'ASSIGNED', assignedUserId: ctx.userId }
          : {}),
      } as never,
    });

    this.events.emitToTeam(ctx.teamId, 'conversation.message.new', {
      conversationId: conv.id,
      channelId: conv.channelId,
      channelKind: conv.channelKind,
      message: {
        id: message.id,
        fromMe: true,
        type: 'text',
        content: message.content,
        status: 'sent',
        timestamp: ts.toISOString(),
        externalId,
      },
    });
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
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
      externalId,
    };
  }

  async sendMedia(
    conversationId: string,
    dto: SendInboxMediaDto,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<MessagePayload> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede responder una conversación resuelta — reabrila primero');
    }
    // Fase 1b — guard de ventana dirigido por capability del canal (ver sendText).
    const freeformWindowAt = conv.freeformWindowAt;
    if (
      this.whatsapp.capabilities.freeformWindow.enforced &&
      (!freeformWindowAt || freeformWindowAt.getTime() < Date.now())
    ) {
      throw new BadRequestException(
        'Ventana de 24h cerrada — sólo se puede responder con plantilla.',
      );
    }

    const cfg = await this.prisma.scoped.channel.findFirst({
      where: { id: conv.channelId },
    });
    if (!cfg) throw new ConflictException('El canal asociado ya no existe');
    if (!cfg.isActive) throw new ConflictException('El canal está deshabilitado');

    const type: WapiMediaType = dto.type;
    let upload;
    try {
      upload = await this.media.uploadToMeta({
        configId: cfg.id,
        type,
        buffer: file.buffer,
        mime: file.mimetype,
        filename: file.originalname,
        caption: dto.caption,
      });
    } catch (err) {
      if (err instanceof WapiMediaException) {
        if (err.code === 'INVALID_MIME' || err.code === 'TOO_LARGE') {
          throw new BadRequestException(err.message);
        }
        throw new BadRequestException(`Media: ${err.message}`);
      }
      throw err;
    }

    let externalId: string;
    try {
      // Fase 1b — envío vía WhatsAppAdapter (capa de canal).
      const result = await this.whatsapp.send(
        {
          phoneNumberId: cfg.phoneNumberId!,
          accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
          isTestMode: cfg.isTestMode,
        },
        {
          kind: 'media',
          to: conv.externalUserId,
          mediaType: type,
          mediaId: upload.mediaId,
          caption: dto.caption,
          filename: type === 'document' ? file.originalname : undefined,
        },
      );
      externalId = result.externalMessageId;
    } catch (err) {
      if (err instanceof WapiSendException) {
        throw new BadRequestException(`Meta API: ${err.detail.message}`);
      }
      throw err;
    }

    const ts = new Date();
    const contentMedia: Record<string, unknown> = { id: upload.mediaId };
    if (dto.caption) contentMedia.caption = dto.caption;
    if (type === 'document') contentMedia.filename = file.originalname;
    const message = await this.prisma.scoped.message.create({
      data: {
        conversationId: conv.id,
        channelId: conv.channelId,
        externalId,
        fromMe: true,
        type,
        content: { [type]: contentMedia } as Prisma.InputJsonValue,
        status: 'sent',
        timestamp: ts,
        mediaId: upload.mediaId,
        mediaMime: file.mimetype,
        mediaSha256: upload.sha256,
        mediaSize: upload.size,
        mediaFilename: file.originalname,
        mediaCaption: dto.caption ?? null,
        mediaLocalPath: upload.localPath,
      } as never,
    });

    const becomesAssigned = conv.status === 'UNASSIGNED' && !conv.assignedUserId;
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        lastMessageAt: ts,
        firstReplyAt: conv.firstReplyAt ?? ts,
        ...(becomesAssigned
          ? { status: 'ASSIGNED', assignedUserId: ctx.userId }
          : {}),
      } as never,
    });

    this.events.emitToTeam(ctx.teamId, 'conversation.message.new', {
      conversationId: conv.id,
      channelId: conv.channelId,
      channelKind: conv.channelKind,
      message: {
        id: message.id,
        fromMe: true,
        type,
        content: message.content,
        status: 'sent',
        timestamp: ts.toISOString(),
        externalId,
        mediaMime: file.mimetype,
        mediaSize: upload.size,
        mediaFilename: file.originalname,
        mediaCaption: dto.caption ?? null,
      },
    });
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
    });

    return {
      id: message.id,
      fromMe: true,
      type,
      content: message.content,
      status: 'sent',
      timestamp: ts,
      externalId,
    };
  }

  /**
   * Resuelve un Message por id y devuelve la metadata necesaria para que el
   * controller streamee el binario local. No expone el path absoluto.
   */
  async getMessageMediaMeta(messageId: string): Promise<{
    localPath: string;
    mime: string;
    filename: string;
    size: number;
  }> {
    this.requireContext();
    const msg = await this.prisma.scoped.message.findFirst({
      where: { id: messageId },
      select: {
        mediaLocalPath: true,
        mediaMime: true,
        mediaFilename: true,
        mediaSize: true,
        type: true,
      },
    });
    if (!msg) throw new NotFoundException(`Mensaje ${messageId} no encontrado`);
    if (!msg.mediaLocalPath) {
      throw new NotFoundException(`Mensaje ${messageId} no tiene media adjunto`);
    }
    return {
      localPath: msg.mediaLocalPath,
      mime: msg.mediaMime ?? 'application/octet-stream',
      filename: msg.mediaFilename ?? 'media',
      size: msg.mediaSize ?? 0,
    };
  }

  async setReadState(conversationId: string, read: boolean): Promise<{ unreadCount: number }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);

    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: read
        ? { unreadCount: 0, lastReadAt: new Date() }
        : { unreadCount: 1 },
      select: { unreadCount: true },
    });

    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
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
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede asignar una conversación resuelta');
    }
    // 4.O.6 — tomar/asignar suspende el bot, escala (si veníamos de WAITING),
    // limpia el TTL y cachea quién es el último responsable para el badge "asignado a X".
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        assignedUserId: userId,
        status: 'ASSIGNED',
        botSuspended: true,
        escalated: true,
        waitingUntil: null,
        lastAssignedUserId: userId,
      } as never,
      select: { id: true, assignedUserId: true, status: true },
    });
    await this.endBotSessionsFor(updated.id, 'operator-assign');
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
    });
    return { id: updated.id, assignedUserId: updated.assignedUserId! };
  }

  async unassign(conversationId: string): Promise<{ id: string }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('No se puede dejar libre una conversación resuelta');
    }
    // 4.O.6 — el bot sigue suspendido (la conversación ya está escalada y debe
    // resolverse por humano) y limpiamos waitingUntil por si veníamos de WAITING.
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        assignedUserId: null,
        status: 'UNASSIGNED',
        waitingUntil: null,
      } as never,
      select: { id: true, status: true, assignedUserId: true },
    });
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
    });
    return { id: updated.id };
  }

  async resolve(
    conversationId: string,
    dto: ResolveConversationDto,
  ): Promise<{ id: string; resolvedAt: Date }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status === 'RESOLVED') {
      throw new ConflictException('La conversación ya está resuelta');
    }

    const resolvedAt = new Date();
    // 4.O.6 — al resolver, el bot vuelve a estar disponible para el próximo
    // inbound del cliente. Mantenemos `escalated=true` y `lastAssignedUserId`
    // como auditoría (la pestaña "resueltas" filtra por escalated=true).
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        status: 'RESOLVED',
        resolvedAt,
        botSuspended: false,
        waitingUntil: null,
      } as never,
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

    await this.endBotSessionsFor(updated.id, 'resolved');
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    });
    return { id: updated.id, resolvedAt: updated.resolvedAt! };
  }

  async reopen(conversationId: string): Promise<{ id: string }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true, assignedUserId: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status !== 'RESOLVED') {
      throw new ConflictException('Sólo se reabren conversaciones resueltas');
    }
    const nextStatus = conv.assignedUserId ? 'ASSIGNED' : 'UNASSIGNED';
    // 4.O.6 — reopen manual implica que el operador retoma; bot suspendido.
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        status: nextStatus,
        resolvedAt: null,
        botSuspended: true,
      } as never,
      select: { id: true, status: true, assignedUserId: true },
    });
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: updated.id,
      status: updated.status,
      assignedUserId: updated.assignedUserId,
      resolvedAt: null,
    });
    return { id: updated.id };
  }

  /**
   * 4.O.6 — "Poner en espera": el operador respondió y espera al cliente.
   * Status pasa a WAITING con un TTL configurable por cfg.botWaitingTtlMin.
   * Liberamos `assignedUserId` (la conversación deja de estar bajo el badge
   * "asignado a mí" como ASSIGNED y aparece en el sub-tab WAITING de "mis"
   * gracias a `lastAssignedUserId`). El worker periódico expira las que
   * pasen el TTL devolviéndolas a UNASSIGNED. El bot sigue suspendido —
   * sólo el resolve manual lo libera.
   */
  async putOnHold(conversationId: string): Promise<{ id: string; waitingUntil: Date }> {
    const ctx = this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
      where: { id: conversationId },
      select: { id: true, status: true, assignedUserId: true, channelId: true },
    });
    if (!conv) throw new NotFoundException(`Conversación ${conversationId} no encontrada`);
    if (conv.status !== 'ASSIGNED') {
      throw new ConflictException('Sólo se puede poner en espera una conversación asignada');
    }
    const cfg = await this.prisma.scoped.channel.findFirst({
      where: { id: conv.channelId },
      select: { botWaitingTtlMin: true } as never,
    });
    const ttlMin = Math.max(1, ((cfg as unknown as { botWaitingTtlMin?: number } | null)?.botWaitingTtlMin) ?? 120);
    const waitingUntil = new Date(Date.now() + ttlMin * 60_000);
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conv.id },
      data: {
        status: 'WAITING',
        waitingUntil,
        lastAssignedUserId: conv.assignedUserId ?? ctx.userId,
        assignedUserId: null,
      } as never,
      select: { id: true, status: true, assignedUserId: true } as never,
    });
    const u = updated as unknown as { id: string; status: string; assignedUserId: string | null };
    this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
      id: u.id,
      status: u.status,
      assignedUserId: u.assignedUserId,
      waitingUntil: waitingUntil.toISOString(),
    });
    return { id: u.id, waitingUntil };
  }

  async listResolutionNotes(conversationId: string): Promise<
    Array<{ id: string; note: string; authorUserId: string | null; createdAt: Date }>
  > {
    this.requireContext();
    const conv = await this.prisma.scoped.conversation.findFirst({
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
    dto: AssignConversationDto,
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
