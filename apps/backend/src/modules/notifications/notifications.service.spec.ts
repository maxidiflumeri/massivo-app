import type { RequestContext } from '@massivo/shared-types';
import { NotificationsService } from './notifications.service';
import { TenantContext } from '../../common/auth/tenant-context';

describe('NotificationsService', () => {
  let prisma: any;
  let events: { emitToUser: jest.Mock; emitToTeam: jest.Mock };
  let svc: NotificationsService;

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 'n1',
      userId: 'u1',
      type: 'NEW_MESSAGE',
      conversationId: 'c1',
      channelId: 'ch1',
      channelKind: 'WHATSAPP',
      title: 'Juan',
      body: 'hola',
      readAt: null,
      createdAt: new Date('2026-06-08T10:00:00Z'),
      ...over,
    };
  }

  const base = {
    organizationId: 'org1',
    teamId: 'team1',
    conversationId: 'c1',
    channelId: 'ch1',
    channelKind: 'WHATSAPP',
    externalUserId: '549110000000',
    bodyPreview: 'hola',
  };

  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      scoped: {
        notification: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    };
    events = { emitToUser: jest.fn(), emitToTeam: jest.fn() };
    svc = new NotificationsService(prisma as never, events as never);
  });

  it('notifyInbound: conversación asignada → notif personal al dueño', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      lastAssignedUserId: null,
      escalated: true,
      name: 'Juan',
    });
    await svc.notifyInbound(base);
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(events.emitToUser).toHaveBeenCalledWith('u1', 'notification.new', expect.objectContaining({ bucket: 'mine' }));
  });

  it('notifyInbound: no escalada (la maneja el bot) → no notifica', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      status: 'UNASSIGNED',
      assignedUserId: null,
      lastAssignedUserId: null,
      escalated: false,
      name: null,
    });
    await svc.notifyInbound(base);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(events.emitToUser).not.toHaveBeenCalled();
  });

  it('notifyInbound: escalada sin dueño → la cubre el HANDOFF, no notifica acá', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      status: 'UNASSIGNED',
      assignedUserId: null,
      lastAssignedUserId: null,
      escalated: true,
      name: null,
    });
    await svc.notifyInbound(base);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyInbound: volvió a la cola con último dueño → notif personal a lastAssignedUserId', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      status: 'UNASSIGNED',
      assignedUserId: null,
      lastAssignedUserId: 'u2',
      escalated: true,
      name: 'Ana',
    });
    await svc.notifyInbound(base);
    expect(events.emitToUser).toHaveBeenCalledWith('u2', 'notification.new', expect.objectContaining({ bucket: 'mine' }));
  });

  it('notifyEscalation: emite al equipo (balde sin asignar)', async () => {
    prisma.notification.create.mockResolvedValue(row({ userId: null, type: 'HANDOFF' }));
    await svc.notifyEscalation(base);
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team1',
      'notification.new',
      expect.objectContaining({ bucket: 'unassigned' }),
    );
  });

  it('coalesce: si existe una notif activa no leída, hace update en vez de create', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      lastAssignedUserId: null,
      escalated: true,
      name: 'Juan',
    });
    prisma.notification.findFirst.mockResolvedValue({ id: 'existing' });
    await svc.notifyInbound(base);
    expect(prisma.notification.update).toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('clearUnassignedForConversation: marca leídas y emite notification.read al equipo', async () => {
    await svc.clearUnassignedForConversation('team1', 'c1');
    expect(prisma.notification.updateMany).toHaveBeenCalled();
    expect(events.emitToTeam).toHaveBeenCalledWith('team1', 'notification.read', {
      conversationId: 'c1',
      bucket: 'unassigned',
    });
  });

  it('list: separa baldes y devuelve contadores no leídos', async () => {
    prisma.scoped.notification.findMany
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row({ userId: null, type: 'HANDOFF' })]);
    prisma.scoped.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const res = await TenantContext.run(ctx, () => svc.list());
    expect(res.mine).toHaveLength(1);
    expect(res.unassigned).toHaveLength(1);
    expect(res.mineUnread).toBe(1);
    expect(res.unassignedUnread).toBe(2);
  });
});
