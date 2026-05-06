import { WapiBotWaitingExpirerService } from './wapi-bot-waiting-expirer.service';

describe('WapiBotWaitingExpirerService', () => {
  let prisma: { wapiConversation: { findMany: jest.Mock; update: jest.Mock } };
  let events: { emitToTeam: jest.Mock };
  let svc: WapiBotWaitingExpirerService;

  beforeEach(() => {
    prisma = {
      wapiConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    events = { emitToTeam: jest.fn() };
    svc = new WapiBotWaitingExpirerService(prisma as never, events as never);
  });

  afterEach(() => {
    svc.onModuleDestroy();
  });

  it('tick sin filas vencidas → no toca DB ni emite', async () => {
    prisma.wapiConversation.findMany.mockResolvedValue([]);
    const out = await svc.tick();
    expect(out.expired).toBe(0);
    expect(prisma.wapiConversation.update).not.toHaveBeenCalled();
    expect(events.emitToTeam).not.toHaveBeenCalled();
  });

  it('tick con filas vencidas → vuelve a UNASSIGNED + emite por cada team', async () => {
    prisma.wapiConversation.findMany.mockResolvedValue([
      { id: 'c1', teamId: 't1', configId: 'cfg1', phone: '5491100' },
      { id: 'c2', teamId: 't2', configId: 'cfg2', phone: '5491200' },
    ]);

    const out = await svc.tick();

    expect(out.expired).toBe(2);
    expect(prisma.wapiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'WAITING',
          waitingUntil: { lt: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.wapiConversation.update).toHaveBeenCalledTimes(2);
    expect(prisma.wapiConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'UNASSIGNED', waitingUntil: null },
    });
    expect(events.emitToTeam).toHaveBeenCalledWith(
      't1',
      'wapi.conversation.updated',
      expect.objectContaining({ id: 'c1', status: 'UNASSIGNED', waitingUntil: null }),
    );
    expect(events.emitToTeam).toHaveBeenCalledWith(
      't2',
      'wapi.conversation.updated',
      expect.objectContaining({ id: 'c2' }),
    );
  });

  it('si un update individual falla, el resto sigue', async () => {
    prisma.wapiConversation.findMany.mockResolvedValue([
      { id: 'c1', teamId: 't1', configId: 'cfg1', phone: '5491100' },
      { id: 'c2', teamId: 't1', configId: 'cfg1', phone: '5491200' },
    ]);
    prisma.wapiConversation.update
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const out = await svc.tick();

    expect(out.expired).toBe(1);
    expect(events.emitToTeam).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit / onModuleDestroy administran un setInterval', () => {
    jest.useFakeTimers();
    const tickSpy = jest.spyOn(svc, 'tick').mockResolvedValue({ expired: 0 });

    svc.onModuleInit();
    expect(tickSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5 * 60_000);
    expect(tickSpy).toHaveBeenCalledTimes(1);

    svc.onModuleDestroy();
    jest.advanceTimersByTime(10 * 60_000);
    // Tras destroy, no se ejecutan más ticks.
    expect(tickSpy).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
