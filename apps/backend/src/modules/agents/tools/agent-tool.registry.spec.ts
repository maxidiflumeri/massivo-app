import { AgentToolRegistry } from './agent-tool.registry';

const escalate = {
  def: { name: 'escalate_to_operator', description: 'derivar', parameters: { type: 'object' } },
  execute: jest.fn(),
} as never;

function makePrisma(links: unknown[]) {
  return {
    agentCustomToolLink: { findMany: jest.fn().mockResolvedValue(links) },
  } as never;
}

const executor = { execute: jest.fn() } as never;
const encryption = { encrypt: jest.fn(), decrypt: jest.fn() } as never;

function makeToolRow(name: string) {
  return {
    id: `id-${name}`,
    name,
    description: `tool ${name}`,
    parameters: { type: 'object', properties: {} },
    method: 'GET',
    url: 'https://api.example.com/x',
    headers: null,
    bodyTemplate: null,
    timeoutMs: null,
  };
}

describe('AgentToolRegistry.resolveForAgent', () => {
  it('sin custom tools → solo built-ins', async () => {
    const registry = new AgentToolRegistry(escalate, makePrisma([]), executor, encryption);
    const resolved = await registry.resolveForAgent('agent-1');
    expect(resolved.defs.map((d) => d.name)).toEqual(['escalate_to_operator']);
    expect(resolved.get('escalate_to_operator')).toBeDefined();
  });

  it('suma las custom linkeadas y el get devuelve la misma foto', async () => {
    const prisma = makePrisma([
      { tool: makeToolRow('consultar_stock') },
      { tool: makeToolRow('crear_ticket') },
    ]);
    const registry = new AgentToolRegistry(escalate, prisma, executor, encryption);
    const resolved = await registry.resolveForAgent('agent-1');

    expect(resolved.defs.map((d) => d.name)).toEqual([
      'escalate_to_operator',
      'consultar_stock',
      'crear_ticket',
    ]);
    expect(resolved.get('consultar_stock')?.def.description).toBe('tool consultar_stock');
    // filtra por agente y tools enabled
    expect((prisma as { agentCustomToolLink: { findMany: jest.Mock } }).agentCustomToolLink.findMany)
      .toHaveBeenCalledWith(expect.objectContaining({
        where: { agentId: 'agent-1', tool: { enabled: true } },
      }));
  });

  it('una custom que pisa una built-in NO la reemplaza (built-ins ganan)', async () => {
    const prisma = makePrisma([{ tool: makeToolRow('escalate_to_operator') }]);
    const registry = new AgentToolRegistry(escalate, prisma, executor, encryption);
    const resolved = await registry.resolveForAgent('agent-1');

    expect(resolved.defs).toHaveLength(1);
    expect(resolved.get('escalate_to_operator')).toBe(escalate);
  });
});
