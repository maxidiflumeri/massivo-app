import { BadRequestException } from '@nestjs/common';
import { AgentCustomToolsService, SECRET_MASK } from './agent-custom-tools.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

const ctx: RequestContext = {
  organizationId: 'org-1',
  teamId: 'team-1',
  userId: 'user-1',
} as unknown as RequestContext;

const encryption = {
  encrypt: jest.fn((v: string) => `enc(${v})`),
  decrypt: jest.fn((v: string) => v),
} as never;

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    scoped: {
      agentCustomTool: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      agent: { findFirst: jest.fn().mockResolvedValue({ id: 'agent-1' }) },
    },
    agentCustomToolLink: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    ...over,
  } as never;
}

const validDto = {
  name: 'consultar_stock',
  displayName: 'Consultar stock',
  description: 'Consulta el stock de un SKU. Usala cuando pregunten disponibilidad.',
  parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
  method: 'GET',
  url: 'https://api.example.com/stock/{{args.sku}}',
};

describe('AgentCustomToolsService', () => {
  it('create: rechaza nombre de built-in', async () => {
    const svc = new AgentCustomToolsService(makePrisma(), encryption);
    await TenantContext.run(ctx, async () => {
      await expect(svc.create({ ...validDto, name: 'escalate_to_operator' } as never))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('create: rechaza parameters sin raíz type object', async () => {
    const svc = new AgentCustomToolsService(makePrisma(), encryption);
    await TenantContext.run(ctx, async () => {
      await expect(svc.create({ ...validDto, parameters: { type: 'string' } } as never))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('create: rechaza URL no http(s) (con placeholders sustituidos)', async () => {
    const svc = new AgentCustomToolsService(makePrisma(), encryption);
    await TenantContext.run(ctx, async () => {
      await expect(svc.create({ ...validDto, url: 'ftp://x.com/{{args.a}}' } as never))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('create: rechaza nombre duplicado en el team', async () => {
    const prisma = makePrisma();
    (prisma as { scoped: { agentCustomTool: { findFirst: jest.Mock } } })
      .scoped.agentCustomTool.findFirst.mockResolvedValue({ id: 'otra' });
    const svc = new AgentCustomToolsService(prisma, encryption);
    await TenantContext.run(ctx, async () => {
      await expect(svc.create(validDto as never)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('create: encripta headers secret y el DTO de salida los enmascara', async () => {
    const prisma = makePrisma();
    const createMock = (prisma as { scoped: { agentCustomTool: { create: jest.Mock } } })
      .scoped.agentCustomTool.create;
    createMock.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 't1', type: 'HTTP', enabled: true, timeoutMs: null, bodyTemplate: null,
        createdAt: new Date(), updatedAt: new Date(), agents: [],
        ...data,
      }),
    );
    const svc = new AgentCustomToolsService(prisma, encryption);

    await TenantContext.run(ctx, async () => {
      const dto = await svc.create({
        ...validDto,
        headers: [
          { key: 'X-Api-Key', value: 'super-secreta', secret: true },
          { key: 'Accept', value: 'application/json' },
        ],
      } as never);

      // Persistido: encriptado
      const saved = createMock.mock.calls[0][0].data.headers as Array<Record<string, unknown>>;
      expect(saved[0]!).toEqual({ key: 'X-Api-Key', value: 'enc(super-secreta)', secret: true });
      expect(saved[1]!).toEqual({ key: 'Accept', value: 'application/json', secret: false });
      // Respuesta: enmascarado
      expect(dto.headers[0]!.value).toBe(SECRET_MASK);
      expect(dto.headers[1]!.value).toBe('application/json');
    });
  });

  it('update: header con value enmascarado conserva el secreto previo', async () => {
    const prisma = makePrisma();
    const scoped = (prisma as {
      scoped: { agentCustomTool: { findFirst: jest.Mock; update: jest.Mock } };
    }).scoped.agentCustomTool;
    scoped.findFirst.mockResolvedValue({
      id: 't1', name: 'consultar_stock',
      headers: [{ key: 'X-Api-Key', value: 'enc(vieja)', secret: true }],
    });
    scoped.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 't1', type: 'HTTP', enabled: true, timeoutMs: null, bodyTemplate: null,
        name: 'consultar_stock', displayName: 'x', description: 'x', parameters: {},
        method: 'GET', url: 'https://x.com', createdAt: new Date(), updatedAt: new Date(),
        agents: [], ...data,
      }),
    );
    const svc = new AgentCustomToolsService(prisma, encryption);

    await TenantContext.run(ctx, async () => {
      await svc.update('t1', {
        headers: [{ key: 'X-Api-Key', value: SECRET_MASK, secret: true }],
      } as never);
      const saved = scoped.update.mock.calls[0][0].data.headers as Array<Record<string, unknown>>;
      expect(saved[0]!).toEqual({ key: 'X-Api-Key', value: 'enc(vieja)', secret: true });
    });
  });

  it('assignToAgent: rechaza tools de otro team y reemplaza el set en transacción', async () => {
    const prisma = makePrisma();
    const scopedTool = (prisma as { scoped: { agentCustomTool: { findMany: jest.Mock } } })
      .scoped.agentCustomTool;
    scopedTool.findMany.mockResolvedValue([{ id: 'tA' }]); // tB no es del team
    const svc = new AgentCustomToolsService(prisma, encryption);

    await TenantContext.run(ctx, async () => {
      await expect(svc.assignToAgent('agent-1', ['tA', 'tB']))
        .rejects.toBeInstanceOf(BadRequestException);

      scopedTool.findMany.mockResolvedValue([{ id: 'tA' }, { id: 'tB' }]);
      const res = await svc.assignToAgent('agent-1', ['tA', 'tB', 'tA']);
      expect(res.toolIds).toEqual(['tA', 'tB']); // dedup
      expect((prisma as { $transaction: jest.Mock }).$transaction).toHaveBeenCalled();
    });
  });
});
