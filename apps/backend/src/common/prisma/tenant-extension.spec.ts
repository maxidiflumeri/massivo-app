import { TenantContext } from '../auth/tenant-context';
import { tenantScopeOperation } from './tenant-extension';
import { ORG_SCOPED_MODELS, TENANT_SCOPED_MODELS } from './tenant-models';

const baseCtx = {
  userId: 'user-1',
  organizationId: 'org-A',
  teamId: 'team-X',
  orgRole: 'ADMIN' as const,
  teamRole: 'ADMIN' as const,
};

async function runCallback(model: string, operation: string, args: Record<string, unknown>) {
  let receivedArgs: unknown = undefined;
  const query = async (a: unknown) => {
    receivedArgs = a;
    return { ok: true };
  };
  const result = await tenantScopeOperation({ model, operation, args, query });
  return { result, receivedArgs };
}

describe('tenantExtension', () => {
  beforeAll(() => {
    TENANT_SCOPED_MODELS.add('FakeTenantModel');
  });
  afterAll(() => {
    TENANT_SCOPED_MODELS.delete('FakeTenantModel');
  });

  describe('global models (no scope)', () => {
    it('passa la query sin tocar args aunque no haya contexto', async () => {
      const { receivedArgs } = await runCallback('Plan', 'findMany', { where: { code: 'FREE' } });
      expect(receivedArgs).toEqual({ where: { code: 'FREE' } });
    });
  });

  describe('org-scoped models sin contexto', () => {
    it('throws en strict mode', async () => {
      const orgScopedModel = ORG_SCOPED_MODELS.values().next().value as string;
      await expect(runCallback(orgScopedModel, 'findMany', {})).rejects.toThrow(/sin TenantContext/);
    });

    it('pasa cuando se ejecuta dentro de runUnscoped', async () => {
      const orgScopedModel = ORG_SCOPED_MODELS.values().next().value as string;
      const result = await TenantContext.runUnscoped(() => runCallback(orgScopedModel, 'findMany', { where: { foo: 1 } }));
      expect(result.receivedArgs).toEqual({ where: { foo: 1 } });
    });
  });

  describe('org-scoped models con contexto', () => {
    it('inyecta organizationId en findMany.where', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('Subscription', 'findMany', { where: { status: 'ACTIVE' } }),
      );
      expect(receivedArgs).toEqual({ where: { status: 'ACTIVE', organizationId: 'org-A' } });
    });

    it('inyecta organizationId en create.data', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('Subscription', 'create', { data: { planId: 'plan-1' } }),
      );
      expect(receivedArgs).toEqual({ data: { organizationId: 'org-A', planId: 'plan-1' } });
    });

    it('NO inyecta teamId (org-scoped, no tenant-scoped)', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('Subscription', 'findFirst', {}),
      );
      expect(receivedArgs).toEqual({ where: { organizationId: 'org-A' } });
      expect((receivedArgs as { where: Record<string, unknown> }).where.teamId).toBeUndefined();
    });
  });

  describe('tenant-scoped models con contexto', () => {
    it('inyecta organizationId Y teamId en findMany.where', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('FakeTenantModel', 'findMany', {}),
      );
      expect(receivedArgs).toEqual({ where: { organizationId: 'org-A', teamId: 'team-X' } });
    });

    it('inyecta scope en createMany (array de data)', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('FakeTenantModel', 'createMany', { data: [{ name: 'a' }, { name: 'b' }] }),
      );
      expect(receivedArgs).toEqual({
        data: [
          { organizationId: 'org-A', teamId: 'team-X', name: 'a' },
          { organizationId: 'org-A', teamId: 'team-X', name: 'b' },
        ],
      });
    });

    it('inyecta where Y create en upsert', async () => {
      const { receivedArgs } = await TenantContext.run(baseCtx, () =>
        runCallback('FakeTenantModel', 'upsert', {
          where: { id: 'x' },
          create: { name: 'a' },
          update: { name: 'b' },
        }),
      );
      expect(receivedArgs).toEqual({
        where: { id: 'x', organizationId: 'org-A', teamId: 'team-X' },
        create: { organizationId: 'org-A', teamId: 'team-X', name: 'a' },
        update: { name: 'b' },
      });
    });
  });

  describe('aislamiento entre tenants', () => {
    it('dos contextos concurrentes no se mezclan', async () => {
      const ctxB = { ...baseCtx, organizationId: 'org-B', teamId: 'team-Y' };

      const [resA, resB] = await Promise.all([
        TenantContext.run(baseCtx, () => runCallback('Subscription', 'findMany', {})),
        TenantContext.run(ctxB, () => runCallback('Subscription', 'findMany', {})),
      ]);

      expect((resA.receivedArgs as { where: Record<string, unknown> }).where.organizationId).toBe('org-A');
      expect((resB.receivedArgs as { where: Record<string, unknown> }).where.organizationId).toBe('org-B');
    });
  });
});
