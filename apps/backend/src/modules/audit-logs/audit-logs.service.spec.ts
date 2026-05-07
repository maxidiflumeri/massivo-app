import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  let prismaScoped: { auditLog: { findMany: jest.Mock } };
  let prismaUser: { findMany: jest.Mock };
  let svc: AuditLogsService;

  const mkRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'a1',
    action: 'wapi.bot.published',
    resourceType: 'WapiBotFlow',
    resourceId: 'f1',
    metadata: { foo: 'bar' },
    ip: '1.2.3.4',
    userAgent: 'ua',
    teamId: 't1',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    actorUserId: 'u1',
    ...overrides,
  });

  beforeEach(() => {
    prismaScoped = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } };
    prismaUser = { findMany: jest.fn().mockResolvedValue([]) };
    svc = new AuditLogsService({ scoped: prismaScoped, user: prismaUser } as never);
  });

  it('list vacío → items:[], nextCursor:null', async () => {
    const r = await svc.list({});
    expect(r).toEqual({ items: [], nextCursor: null });
    expect(prismaScoped.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('limit por defecto = 50, cuando se sobrepasa devuelve nextCursor', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => mkRow({ id: `a${i}`, actorUserId: null }));
    prismaScoped.auditLog.findMany.mockResolvedValueOnce(rows);
    const r = await svc.list({});
    expect(r.items).toHaveLength(50);
    expect(r.nextCursor).toBe('a49');
  });

  it('clampea limit a [1,200]', async () => {
    await svc.list({ limit: 999 });
    expect(prismaScoped.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 201 }),
    );
    await svc.list({ limit: 0 });
    expect(prismaScoped.auditLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 51 }),
    );
  });

  it('cursor → skip:1, cursor:{id}', async () => {
    await svc.list({ cursor: 'c1' });
    expect(prismaScoped.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'c1' }, skip: 1 }),
    );
  });

  it('aplica filtros actor/resource/action', async () => {
    await svc.list({
      actorUserId: 'u1',
      resourceType: 'WapiCampaign',
      resourceId: 'c1',
      action: 'wapi.campaign.sent',
    });
    expect(prismaScoped.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorUserId: 'u1',
          resourceType: 'WapiCampaign',
          resourceId: 'c1',
          action: 'wapi.campaign.sent',
        },
      }),
    );
  });

  it('aplica filtros de fecha from/to', async () => {
    await svc.list({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    const call = prismaScoped.auditLog.findMany.mock.calls[0]![0];
    expect(call.where.createdAt.gte).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(call.where.createdAt.lte).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  it('enriquece con datos de usuario actor', async () => {
    prismaScoped.auditLog.findMany.mockResolvedValueOnce([mkRow({ actorUserId: 'u1' })]);
    prismaUser.findMany.mockResolvedValueOnce([
      { id: 'u1', name: 'Juan', email: 'j@x.com', avatarUrl: null },
    ]);
    const r = await svc.list({});
    expect(r.items[0]!.actor).toEqual({
      id: 'u1',
      name: 'Juan',
      email: 'j@x.com',
      avatarUrl: null,
    });
  });

  it('actorUserId null → actor:null sin consultar User', async () => {
    prismaScoped.auditLog.findMany.mockResolvedValueOnce([mkRow({ actorUserId: null })]);
    const r = await svc.list({});
    expect(r.items[0]!.actor).toBeNull();
    expect(prismaUser.findMany).not.toHaveBeenCalled();
  });

  it('actor faltante en User table → actor:null', async () => {
    prismaScoped.auditLog.findMany.mockResolvedValueOnce([mkRow({ actorUserId: 'u-deleted' })]);
    prismaUser.findMany.mockResolvedValueOnce([]);
    const r = await svc.list({});
    expect(r.items[0]!.actor).toBeNull();
  });
});
