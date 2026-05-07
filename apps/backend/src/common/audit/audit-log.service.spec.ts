import { AuditLogService, sanitize } from './audit-log.service';
import { TenantContext } from '../auth/tenant-context';

describe('AuditLogService', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let svc: AuditLogService;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    svc = new AuditLogService(prisma as never);
  });

  function withCtx<T>(fn: () => Promise<T>) {
    return TenantContext.run(
      { userId: 'u1', organizationId: 'org-1', teamId: 'team-1', orgRole: 'OWNER', teamRole: 'ADMIN' },
      fn,
    );
  }

  it('escribe en auditLog tomando tenant + actor del contexto', async () => {
    await withCtx(() => svc.log({ action: 'wapi.campaign.created', resourceType: 'WapiCampaign', resourceId: 'c1' }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        teamId: 'team-1',
        actorUserId: 'u1',
        action: 'wapi.campaign.created',
        resourceType: 'WapiCampaign',
        resourceId: 'c1',
      }),
    });
  });

  it('descarta el log si no hay organizationId disponible', async () => {
    await svc.log({ action: 'orphan' });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('overrides ganan sobre el contexto (uso por scheduler/jobs cross-tenant)', async () => {
    await withCtx(() =>
      svc.log({
        action: 'wapi.campaign.sent',
        organizationId: 'org-2',
        teamId: 'team-2',
        actorUserId: null,
        metadata: { source: 'scheduler' },
      }),
    );
    const args = prisma.auditLog.create.mock.calls[0][0];
    expect(args.data.organizationId).toBe('org-2');
    expect(args.data.teamId).toBe('team-2');
    expect(args.data.actorUserId).toBeNull();
  });

  it('no rompe si prisma falla — sólo loggea warning', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await withCtx(() => svc.log({ action: 'x' }));
    // si no lanzó, está OK
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('sanitiza metadata con keys sensibles', async () => {
    await withCtx(() =>
      svc.log({
        action: 'wapi.config.updated',
        metadata: {
          name: 'Línea',
          accessToken: 'eaab123',
          appSecret: 'shh',
          nested: { verifyToken: 'tok', other: 'visible' },
          accessTokenEnc: 'cipher',
        },
      }),
    );
    const args = prisma.auditLog.create.mock.calls[0][0];
    expect(args.data.metadata).toEqual({
      name: 'Línea',
      accessToken: '[REDACTED]',
      appSecret: '[REDACTED]',
      nested: { verifyToken: '[REDACTED]', other: 'visible' },
      accessTokenEnc: '[REDACTED]',
    });
  });

  describe('sanitize', () => {
    it('redacta keys sensibles a cualquier profundidad', () => {
      const out = sanitize({
        a: 1,
        password: 'p',
        deep: [{ apiKey: 'k', visible: 'v' }],
      });
      expect(out).toEqual({
        a: 1,
        password: '[REDACTED]',
        deep: [{ apiKey: '[REDACTED]', visible: 'v' }],
      });
    });

    it('null/undefined/primitivos pasan intactos', () => {
      expect(sanitize(null)).toBeNull();
      expect(sanitize(undefined)).toBeUndefined();
      expect(sanitize('hi')).toBe('hi');
      expect(sanitize(42)).toBe(42);
    });
  });
});
