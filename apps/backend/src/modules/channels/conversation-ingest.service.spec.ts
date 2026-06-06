import { ConversationIngestService, type IngestChannel } from './conversation-ingest.service';
import type { InboundMessage } from './adapter.types';

function channel(overrides: Partial<IngestChannel> = {}): IngestChannel {
  return {
    id: 'ch1',
    organizationId: 'org1',
    teamId: 'team1',
    kind: 'MESSENGER',
    accessTokenEnc: 'enc',
    isTestMode: true,
    phoneNumberId: null,
    pageId: 'PAGE1',
    bot: null,
    ...overrides,
  };
}

function textInbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channelKind: 'MESSENGER',
    externalUserId: 'PSID1',
    externalMessageId: 'mid.1',
    timestamp: new Date('2026-06-06T12:00:00.000Z'),
    type: 'text',
    text: 'hola',
    ...overrides,
  };
}

describe('ConversationIngestService', () => {
  let prismaScoped: Record<string, any>;
  let events: { emitToTeam: jest.Mock };
  let botFeature: { isEnabled: jest.Mock };
  let botEngine: { handle: jest.Mock };
  let svc: ConversationIngestService;

  beforeEach(() => {
    prismaScoped = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'conv1', status: 'UNASSIGNED', assignedUserId: null, unreadCount: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'conv1', status: 'UNASSIGNED', assignedUserId: null, unreadCount: 2 }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg1', content: { text: { body: 'hola' } } }),
      },
    };
    events = { emitToTeam: jest.fn() };
    botFeature = { isEnabled: jest.fn().mockResolvedValue(true) };
    botEngine = { handle: jest.fn().mockResolvedValue({ handled: true }) };
    svc = new ConversationIngestService(
      { scoped: prismaScoped } as never,
      events as never,
      botFeature as never,
      botEngine as never,
    );
  });

  it('conversación nueva: crea Conversation con channelKind + Message + emite eventos', async () => {
    await svc.ingest(channel(), [textInbound()]);

    expect(prismaScoped.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channelId: 'ch1',
          channelKind: 'MESSENGER',
          externalUserId: 'PSID1',
        }),
      }),
    );
    expect(prismaScoped.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channelId: 'ch1',
          externalId: 'mid.1',
          fromMe: false,
          type: 'text',
        }),
      }),
    );
    const eventNames = events.emitToTeam.mock.calls.map((c) => c[1]);
    expect(eventNames).toContain('conversation.message.new');
    expect(eventNames).toContain('conversation.updated');
  });

  it('sin bot conectado → no invoca el motor', async () => {
    await svc.ingest(channel({ bot: null }), [textInbound()]);
    expect(botEngine.handle).not.toHaveBeenCalled();
  });

  it('con bot enabled → invoca el motor con kind + pageId + input de texto', async () => {
    await svc.ingest(
      channel({ bot: { enabled: true, flow: {}, sessionTtlMin: 30, topics: null, router: null, variables: null } }),
      [textInbound()],
    );
    expect(botEngine.handle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ch1', kind: 'MESSENGER', pageId: 'PAGE1', botEnabled: true }),
      expect.objectContaining({
        conversationId: 'conv1',
        phone: 'PSID1',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
  });

  it('quick reply → input de button con buttonId=payload', async () => {
    await svc.ingest(
      channel({ bot: { enabled: true, flow: {}, sessionTtlMin: 30, topics: null, router: null, variables: null } }),
      [textInbound({ type: 'interactive_reply', interactiveReplyId: 'bot:soporte', text: 'Soporte' })],
    );
    expect(botEngine.handle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inbound: { kind: 'button', buttonId: 'bot:soporte', contextMetaMessageId: null },
      }),
    );
  });

  it('bot HANDOFF (ended+escalate) → marca priority + emite conversation.updated', async () => {
    botEngine.handle.mockResolvedValue({ handled: true, ended: true, escalate: true });
    prismaScoped.conversation.update.mockResolvedValue({
      id: 'conv1', status: 'UNASSIGNED', assignedUserId: null, lastMessageAt: new Date(), unreadCount: 1, priority: true,
    });

    await svc.ingest(
      channel({ bot: { enabled: true, flow: {}, sessionTtlMin: 30, topics: null, router: null, variables: null } }),
      [textInbound()],
    );

    expect(prismaScoped.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: true }) }),
    );
  });

  it('Message duplicado (P2002) → swallow sin emitir message.new', async () => {
    prismaScoped.message.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await svc.ingest(channel(), [textInbound()]);
    const eventNames = events.emitToTeam.mock.calls.map((c) => c[1]);
    expect(eventNames).not.toContain('conversation.message.new');
  });
});
