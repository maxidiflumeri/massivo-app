import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EventsService } from '../events/events.service';

/** Forma que viaja al frontend (HTTP list + socket `notification.new`). */
export interface NotificationDto {
  id: string;
  type: 'NEW_MESSAGE' | 'ASSIGNED' | 'UNASSIGNED_NEW' | 'HANDOFF';
  bucket: 'mine' | 'unassigned';
  conversationId: string;
  channelId: string;
  channelKind: string;
  title: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResult {
  mine: NotificationDto[];
  unassigned: NotificationDto[];
  mineUnread: number;
  unassignedUnread: number;
}

export type NotificationBucket = 'mine' | 'unassigned' | 'all';

const SELECT = {
  id: true,
  userId: true,
  type: true,
  conversationId: true,
  channelId: true,
  channelKind: true,
  title: true,
  body: true,
  readAt: true,
  createdAt: true,
} as const;

interface NotificationRow {
  id: string;
  userId: string | null;
  type: string;
  conversationId: string;
  channelId: string;
  channelKind: string;
  title: string | null;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationDto['type'],
    bucket: row.userId ? 'mine' : 'unassigned',
    conversationId: row.conversationId,
    channelId: row.channelId,
    channelKind: row.channelKind,
    title: row.title,
    body: row.body,
    read: row.readAt != null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Notificaciones del inbox (campanita del navbar). Dos baldes:
 *  - "Para mí" (`userId` con valor): mensaje nuevo en una conversación que
 *    atiende/atendía el operador, o una conversación recién asignada a él.
 *  - "Sin asignar" (`userId` NULL): cola del equipo — sólo eventos nuevos /
 *    prioritarios (HANDOFF del bot, botón INBOX), no cada mensaje suelto.
 *
 * Los **triggers** (notifyInbound/notifyEscalation/notifyAssigned/clear*) corren
 * en contexto de sistema (webhook / ingest / acción del inbox) y usan el cliente
 * raw `prisma` con org/team explícitos. El **listado** (list/markRead/markAllRead)
 * corre con TenantContext y usa `prisma.scoped` (filtro por tenant automático).
 *
 * Coalesce: una notificación "activa no leída" por (conversación, balde) — el
 * trigger hace bump (update) en vez de crear una fila por mensaje. El historial
 * de mensajes ya vive en la conversación.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ───────────────────────── Triggers (sistema, sin TenantContext) ─────────────

  /**
   * Mensaje inbound. Notifica al **dueño** de la conversación (asignado o, si
   * volvió a la cola desde WAITING/unassign, el último responsable). Si la
   * conversación no está escalada (la maneja el bot) o no tiene dueño, no
   * notifica acá — la cola sin asignar la cubre `notifyEscalation` en el HANDOFF.
   */
  async notifyInbound(p: {
    organizationId: string;
    teamId: string;
    conversationId: string;
    channelId: string;
    channelKind: string;
    externalUserId: string;
    bodyPreview: string | null;
  }): Promise<void> {
    try {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: p.conversationId },
        select: {
          status: true,
          assignedUserId: true,
          lastAssignedUserId: true,
          escalated: true,
          name: true,
        },
      });
      if (!conv || !conv.escalated || conv.status === 'RESOLVED') return;
      const owner = conv.assignedUserId ?? conv.lastAssignedUserId;
      if (!owner) return; // sin asignar & sin dueño → lo cubre el HANDOFF.
      await this.upsertActive({
        organizationId: p.organizationId,
        teamId: p.teamId,
        userId: owner,
        conversationId: p.conversationId,
        channelId: p.channelId,
        channelKind: p.channelKind,
        type: 'NEW_MESSAGE',
        title: conv.name ?? p.externalUserId,
        body: p.bodyPreview,
      });
    } catch (err) {
      this.logger.warn(
        `notifyInbound falló conv=${p.conversationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * La conversación entró a la cola sin asignar y necesita un humano (HANDOFF del
   * bot o botón INBOX de un template). Notifica al equipo (balde "Sin asignar").
   */
  async notifyEscalation(p: {
    organizationId: string;
    teamId: string;
    conversationId: string;
    channelId: string;
    channelKind: string;
    externalUserId: string;
    name?: string | null;
    type?: 'HANDOFF' | 'UNASSIGNED_NEW';
  }): Promise<void> {
    await this.upsertActive({
      organizationId: p.organizationId,
      teamId: p.teamId,
      userId: null,
      conversationId: p.conversationId,
      channelId: p.channelId,
      channelKind: p.channelKind,
      type: p.type ?? 'HANDOFF',
      title: p.name ?? p.externalUserId,
      body: 'Conversación sin asignar — necesita un agente',
    });
  }

  /** Una conversación fue asignada a otro operador → notificación personal a él. */
  async notifyAssigned(p: {
    organizationId: string;
    teamId: string;
    conversationId: string;
    channelId: string;
    channelKind: string;
    assigneeUserId: string;
    title: string | null;
  }): Promise<void> {
    await this.upsertActive({
      organizationId: p.organizationId,
      teamId: p.teamId,
      userId: p.assigneeUserId,
      conversationId: p.conversationId,
      channelId: p.channelId,
      channelKind: p.channelKind,
      type: 'ASSIGNED',
      title: p.title,
      body: 'Se te asignó una conversación',
    });
  }

  /** Alguien tomó la conversación → resuelve la notif "sin asignar" para todos. */
  async clearUnassignedForConversation(teamId: string, conversationId: string): Promise<void> {
    await this.markReadWhere({ teamId, conversationId, userId: null, readAt: null }, () =>
      this.events.emitToTeam(teamId, 'notification.read', { conversationId, bucket: 'unassigned' }),
    );
  }

  /** El operador abrió/leyó la conversación → resuelve su notif personal. */
  async clearForConversationUser(teamId: string, userId: string, conversationId: string): Promise<void> {
    await this.markReadWhere({ teamId, conversationId, userId, readAt: null }, () =>
      this.events.emitToUser(userId, 'notification.read', { conversationId, bucket: 'mine' }),
    );
  }

  /** La conversación se resolvió → resuelve cualquier notif (ambos baldes). */
  async clearAllForConversation(teamId: string, conversationId: string): Promise<void> {
    await this.markReadWhere({ teamId, conversationId, readAt: null }, () =>
      this.events.emitToTeam(teamId, 'notification.read', { conversationId }),
    );
  }

  // ───────────────────────── Listado (TenantContext, scoped) ───────────────────

  async list(): Promise<NotificationListResult> {
    const ctx = this.requireContext();
    const [mine, unassigned, mineUnread, unassignedUnread] = await Promise.all([
      this.prisma.scoped.notification.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: SELECT,
      }),
      this.prisma.scoped.notification.findMany({
        where: { userId: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: SELECT,
      }),
      this.prisma.scoped.notification.count({ where: { userId: ctx.userId, readAt: null } }),
      this.prisma.scoped.notification.count({ where: { userId: null, readAt: null } }),
    ]);
    return {
      mine: mine.map(toDto),
      unassigned: unassigned.map(toDto),
      mineUnread,
      unassignedUnread,
    };
  }

  async markRead(id: string): Promise<{ ok: true }> {
    const ctx = this.requireContext();
    const res = await this.prisma.scoped.notification.updateMany({
      where: { id },
      data: { readAt: new Date() },
    });
    if (res.count > 0) this.events.emitToTeam(ctx.teamId, 'notification.read', { id });
    return { ok: true };
  }

  async markAllRead(bucket: NotificationBucket): Promise<{ ok: true }> {
    const ctx = this.requireContext();
    if (bucket === 'mine' || bucket === 'all') {
      await this.prisma.scoped.notification.updateMany({
        where: { userId: ctx.userId, readAt: null },
        data: { readAt: new Date() },
      });
      this.events.emitToUser(ctx.userId, 'notification.readAll', { bucket: 'mine' });
    }
    if (bucket === 'unassigned' || bucket === 'all') {
      await this.prisma.scoped.notification.updateMany({
        where: { userId: null, readAt: null },
        data: { readAt: new Date() },
      });
      this.events.emitToTeam(ctx.teamId, 'notification.readAll', { bucket: 'unassigned' });
    }
    return { ok: true };
  }

  // ───────────────────────── Internos ──────────────────────────────────────────

  /** Coalesce: bump la notif activa no leída de (conversación, balde), o crea una. */
  private async upsertActive(p: {
    organizationId: string;
    teamId: string;
    userId: string | null;
    conversationId: string;
    channelId: string;
    channelKind: string;
    type: NotificationDto['type'];
    title: string | null;
    body: string | null;
  }): Promise<void> {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: { conversationId: p.conversationId, userId: p.userId, readAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      let row: NotificationRow;
      if (existing) {
        row = await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            type: p.type,
            title: p.title,
            body: p.body,
            channelId: p.channelId,
            channelKind: p.channelKind,
            createdAt: new Date(),
          } as never,
          select: SELECT,
        });
      } else {
        row = await this.prisma.notification.create({
          data: {
            organizationId: p.organizationId,
            teamId: p.teamId,
            userId: p.userId,
            conversationId: p.conversationId,
            channelId: p.channelId,
            channelKind: p.channelKind,
            type: p.type,
            title: p.title,
            body: p.body,
          } as never,
          select: SELECT,
        });
      }
      const dto = toDto(row);
      if (p.userId) this.events.emitToUser(p.userId, 'notification.new', dto);
      else this.events.emitToTeam(p.teamId, 'notification.new', dto);
    } catch (err) {
      this.logger.warn(
        `upsertActive falló conv=${p.conversationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async markReadWhere(
    where: { teamId: string; conversationId: string; userId?: string | null; readAt: null },
    onChanged: () => void,
  ): Promise<void> {
    try {
      const res = await this.prisma.notification.updateMany({ where, data: { readAt: new Date() } });
      if (res.count > 0) onChanged();
    } catch (err) {
      this.logger.warn(`markReadWhere falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant para notificaciones');
    return ctx;
  }
}
