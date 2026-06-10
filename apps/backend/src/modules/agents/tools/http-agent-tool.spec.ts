import { HttpAgentTool, TOOL_RESULT_MAX_CHARS } from './http-agent-tool';
import type { AgentCustomToolRow } from './http-agent-tool';
import type { AgentToolContext } from './agent-tool.types';

const ctx: AgentToolContext = {
  organizationId: 'org-1',
  teamId: 'team-1',
  conversationId: 'conv-1',
  channelId: 'ch-1',
  channelKind: 'WEBCHAT',
  externalUserId: 'visitor-1',
};

function makeRow(over: Partial<AgentCustomToolRow> = {}): AgentCustomToolRow {
  return {
    id: 'tool-1',
    name: 'consultar_stock',
    description: 'Consulta el stock de un SKU.',
    parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
    method: 'GET',
    url: 'https://api.example.com/stock/{{args.sku}}',
    headers: null,
    bodyTemplate: null,
    timeoutMs: null,
    ...over,
  };
}

function makeExecutor(result: unknown) {
  return { execute: jest.fn().mockResolvedValue(result) } as never;
}

const encryption = {
  encrypt: jest.fn((v: string) => `enc(${v})`),
  decrypt: jest.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')),
} as never;

describe('HttpAgentTool', () => {
  it('def expone name/description/parameters de la fila', () => {
    const tool = new HttpAgentTool(makeRow(), makeExecutor({}), encryption);
    expect(tool.def.name).toBe('consultar_stock');
    expect(tool.def.parameters).toMatchObject({ type: 'object' });
  });

  it('ejecuta vía executor con los args como BotData y audit action propia', async () => {
    const executor = makeExecutor({ ok: true, status: 200, body: { stock: 5 }, durationMs: 10 });
    const tool = new HttpAgentTool(makeRow(), executor, encryption);

    const res = await tool.execute({ sku: 'A-1' }, ctx);

    expect((executor as { execute: jest.Mock }).execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'HTTP', method: 'GET', url: 'https://api.example.com/stock/{{args.sku}}' }),
      { args: { sku: 'A-1' } },
      expect.objectContaining({
        mode: 'real',
        organizationId: 'org-1',
        auditAction: 'agent.tool.http.executed',
      }),
    );
    expect(res.content).toBe(JSON.stringify({ stock: 5 }));
    expect(res.stop).toBeUndefined();
  });

  it('desencripta headers secret y pasa los planos tal cual', async () => {
    const executor = makeExecutor({ ok: true, status: 200, body: 'ok', durationMs: 5 });
    const tool = new HttpAgentTool(
      makeRow({
        headers: [
          { key: 'X-Api-Key', value: 'enc(super-secreta)', secret: true },
          { key: 'Accept', value: 'application/json' },
        ],
      }),
      executor,
      encryption,
    );

    await tool.execute({}, ctx);

    const node = (executor as { execute: jest.Mock }).execute.mock.calls[0][0] as {
      headers: Record<string, string>;
    };
    expect(node.headers).toEqual({ 'X-Api-Key': 'super-secreta', Accept: 'application/json' });
  });

  it('error del executor → mensaje para el modelo sin stop (sigue ayudando)', async () => {
    const executor = makeExecutor({ ok: false, status: 0, body: null, error: 'timeout', durationMs: 5000 });
    const tool = new HttpAgentTool(makeRow(), executor, encryption);

    const res = await tool.execute({ sku: 'A-1' }, ctx);

    expect(res.content).toContain('timeout');
    expect(res.content).toContain('Avisale al usuario');
    expect(res.stop).toBeUndefined();
  });

  it('trunca respuestas gigantes a TOOL_RESULT_MAX_CHARS', async () => {
    const huge = 'x'.repeat(TOOL_RESULT_MAX_CHARS * 2);
    const executor = makeExecutor({ ok: true, status: 200, body: huge, durationMs: 5 });
    const tool = new HttpAgentTool(makeRow(), executor, encryption);

    const res = await tool.execute({}, ctx);

    expect(res.content.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS + 20);
    expect(res.content.endsWith('… [truncado]')).toBe(true);
  });

  it('body null/vacío → "(respuesta vacía)"', async () => {
    const executor = makeExecutor({ ok: true, status: 204, body: null, durationMs: 5 });
    const tool = new HttpAgentTool(makeRow(), executor, encryption);
    const res = await tool.execute({}, ctx);
    expect(res.content).toBe('(respuesta vacía)');
  });
});
