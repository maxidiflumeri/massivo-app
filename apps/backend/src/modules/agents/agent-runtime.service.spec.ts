import { AgentRuntimeService, type AgentRunInput } from './agent-runtime.service';

describe('AgentRuntimeService', () => {
  let prisma: any;
  let gateway: { generate: jest.Mock };
  let toolsGet: jest.Mock;
  let tools: { resolveForAgent: jest.Mock };
  let adapter: { send: jest.Mock };
  let registry: { get: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let events: { emitToTeam: jest.Mock; emitToWebchatVisitor: jest.Mock };
  let retrieval: { retrieve: jest.Mock };
  let svc: AgentRuntimeService;

  const input: AgentRunInput = {
    channel: {
      id: 'ch1',
      organizationId: 'org1',
      teamId: 'team1',
      kind: 'WEBCHAT',
      accessTokenEnc: 'enc',
      isTestMode: true,
      phoneNumberId: null,
      pageId: null,
    },
    agent: { id: 'agent1', model: 'anthropic/claude-x', systemPrompt: 'Sos un asistente', temperature: 0.5, maxSteps: 4 },
    conversationId: 'conv1',
    externalUserId: 'visitor1',
  };

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ botSuspended: false }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([
          { fromMe: false, type: 'text', content: { text: { body: 'hola' } } },
        ]),
        create: jest.fn().mockResolvedValue({ id: 'msg-out' }),
      },
    };
    gateway = { generate: jest.fn() };
    adapter = { send: jest.fn().mockResolvedValue({ externalMessageId: 'ext-1' }) };
    registry = { get: jest.fn().mockReturnValue(adapter) };
    toolsGet = jest.fn();
    tools = {
      resolveForAgent: jest.fn().mockResolvedValue({ defs: [], get: toolsGet }),
    };
    encryption = { decrypt: jest.fn((v: string) => v) };
    events = { emitToTeam: jest.fn(), emitToWebchatVisitor: jest.fn() };
    retrieval = { retrieve: jest.fn().mockResolvedValue([]) };
    svc = new AgentRuntimeService(
      prisma as never,
      gateway as never,
      tools as never,
      registry as never,
      encryption as never,
      events as never,
      retrieval as never,
    );
  });

  it('respuesta directa (sin tools) → envía por el adapter + persiste + emite', async () => {
    gateway.generate.mockResolvedValue({ text: '¡Hola! ¿En qué te ayudo?', toolCalls: [], finishReason: 'stop' });
    await svc.handleInbound(input);
    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(adapter.send).toHaveBeenCalledWith(
      { channelId: 'ch1' },
      { kind: 'text', to: 'visitor1', text: '¡Hola! ¿En qué te ayudo?' },
    );
    expect(prisma.message.create).toHaveBeenCalled();
    expect(events.emitToTeam).toHaveBeenCalledWith('team1', 'conversation.message.new', expect.any(Object));
  });

  it('tool-calling → ejecuta la tool y vuelve a llamar al modelo hasta la respuesta final', async () => {
    gateway.generate
      .mockResolvedValueOnce({
        text: null,
        toolCalls: [{ id: 't1', name: 'escalate_to_operator', arguments: { reason: 'lo pidió' } }],
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({ text: 'Te derivo con una persona.', toolCalls: [], finishReason: 'stop' });
    const escalate = { execute: jest.fn().mockResolvedValue({ content: 'escalado' }) };
    toolsGet.mockReturnValue(escalate);

    await svc.handleInbound(input);

    expect(escalate.execute).toHaveBeenCalledWith({ reason: 'lo pidió' }, expect.objectContaining({ conversationId: 'conv1' }));
    expect(gateway.generate).toHaveBeenCalledTimes(2);
    expect(adapter.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: 'Te derivo con una persona.' }));
  });

  it('botSuspended (humano atendiendo) → no llama al modelo ni envía', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ botSuspended: true });
    await svc.handleInbound(input);
    expect(gateway.generate).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });
});
