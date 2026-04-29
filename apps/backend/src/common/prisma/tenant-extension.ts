import { Prisma } from '@massivo/prisma';
import { TenantContext } from '../auth/tenant-context';
import { getModelScope, ScopeKind } from './tenant-models';

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const WHERE_WRITE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany']);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

function buildScopeFilter(scope: ScopeKind, organizationId: string, teamId: string): Record<string, string> {
  const filter: Record<string, string> = { organizationId };
  if (scope === 'tenant') filter.teamId = teamId;
  return filter;
}

interface ExtensionInput {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

export async function tenantScopeOperation({ model, operation, args, query }: ExtensionInput): Promise<unknown> {
  const scope = getModelScope(model);
        if (scope === 'global') {
          return query(args);
        }

        const ctx = TenantContext.current();

        if (!ctx) {
          if (TenantContext.isSkipped()) {
            return query(args);
          }
          throw new Error(
            `[tenant-scope] Query a "${model}" (scope=${scope}, op=${operation}) sin TenantContext. ` +
              `Usá TenantContext.run() o TenantContext.runUnscoped() / @SkipTenantScope() si el caso es legitimo.`,
          );
        }

        const scopeFilter = buildScopeFilter(scope, ctx.organizationId, ctx.teamId);
        const a = (args ?? {}) as Record<string, unknown>;

        if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
          a.where = { ...((a.where as Record<string, unknown>) ?? {}), ...scopeFilter };
        }

        if (CREATE_OPS.has(operation)) {
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const data = a.data;
            const rows = Array.isArray(data) ? data : [data];
            a.data = rows.map((row) => ({ ...scopeFilter, ...(row as Record<string, unknown>) }));
          } else {
            a.data = { ...scopeFilter, ...((a.data as Record<string, unknown>) ?? {}) };
          }
        }

        if (operation === 'upsert') {
          a.where = { ...((a.where as Record<string, unknown>) ?? {}), ...scopeFilter };
          a.create = { ...scopeFilter, ...((a.create as Record<string, unknown>) ?? {}) };
        }

  return query(a);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tenantExtension: any = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations: tenantScopeOperation,
    },
  },
});
