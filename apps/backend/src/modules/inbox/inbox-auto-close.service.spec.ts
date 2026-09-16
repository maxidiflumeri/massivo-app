import { InboxAutoCloseService } from './inbox-auto-close.service';
import { TenantContext } from '../../common/auth/tenant-context';

describe('InboxAutoCloseService', () => {
  const now = new Date('2026-09-16T15:00:00.000Z');
  let prisma: {
    channel: { findMany: jest.Mock };
    conversation: { findMany: jest.Mock };
    botSession: { findMany: jest.Mock };
  };
  let inbox: { autoCloseInactive: jest.Mock; closeIdleBotSession: jest.Mock };
  let svc: InboxAutoCloseService;

  beforeEach(() => {
    prisma = {
      channel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ch1', organizationId: 'org1', teamId: 'team1', autoCloseAfterMin: 120, autoCloseMessage: 'chau' },
        ]),
      },
      conversation: { findMany: jest.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) },
      botSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    inbox = {
      autoCloseInactive: jest.fn().mockResolvedValue(true),
      closeIdleBotSession: jest.fn().mockResolvedValue(true),
    };
    svc = new InboxAutoCloseService(prisma as never, inbox as never);
  });

  it('sólo mira canales activos, con bot y cierre habilitado', async () => {
    await svc.tick(now);
    expect(prisma.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, autoCloseAfterMin: { gt: 0 }, botId: { not: null } },
      }),
    );
  });

  it('busca conversaciones del lado humano sin actividad desde el corte del canal', async () => {
    await svc.tick(now);
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channelId: 'ch1',
          status: { not: 'RESOLVED' },
          botSuspended: true,
          lastMessageAt: { lt: new Date('2026-09-16T13:00:00.000Z') },
        },
      }),
    );
  });

  it('cierra cada una dentro del TenantContext del canal con su config', async () => {
    const seen: Array<string | undefined> = [];
    inbox.autoCloseInactive.mockImplementation(async () => {
      seen.push(TenantContext.current()?.teamId);
      return true;
    });
    const res = await svc.tick(now);
    expect(res.closed).toBe(2);
    expect(inbox.autoCloseInactive).toHaveBeenCalledWith('c1', { afterMin: 120, message: 'chau' });
    expect(seen).toEqual(['team1', 'team1']);
  });

  it('un error en una conversación no corta las demás', async () => {
    inbox.autoCloseInactive.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(true);
    const res = await svc.tick(now);
    expect(res.closed).toBe(1);
    expect(inbox.autoCloseInactive).toHaveBeenCalledTimes(2);
  });

  it('no cuenta las que ya cerró otra instancia', async () => {
    inbox.autoCloseInactive.mockResolvedValue(false);
    const res = await svc.tick(now);
    expect(res.closed).toBe(0);
  });
  it('también cierra sesiones del bot sin respuesta (vencidas o no)', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.botSession.findMany.mockResolvedValue([{ id: 's1' }]);
    const res = await svc.tick(now);
    expect(prisma.botSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channelId: 'ch1',
          endedAt: null,
          lastInboundAt: { lt: new Date('2026-09-16T13:00:00.000Z') },
        },
      }),
    );
    expect(inbox.closeIdleBotSession).toHaveBeenCalledWith('s1', { afterMin: 120, message: 'chau' });
    expect(res.closed).toBe(1);
  });
});
