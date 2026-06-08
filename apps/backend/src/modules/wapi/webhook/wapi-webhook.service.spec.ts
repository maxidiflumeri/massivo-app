/**
 * Tests del WapiWebhookService.process. No bootstrappea Nest — instancia el
 * service con prisma + events mockeados.
 *
 * Cubre:
 *  - status delivered → DELIVERED + deliveredAt
 *  - status read → READ + readAt + deliveredAt si no estaba seteado
 *  - status failed → FAILED + errors[0]
 *  - status delivered cuando ya está READ → no retrocede
 *  - status sin report → log y skip
 *  - mensaje inbound nuevo → upsert conversation + crea WapiMessage
 *  - mensaje duplicado (P2002) → swallow
 *  - emite wapi.report.updated y wapi.message.inbound
 *  - multi-config: payload con dos phone_number_ids → cada entry usa su tenant
 */
import { WapiWebhookService, type ResolvedWebhookConfig } from './wapi-webhook.service';
import { ConversationCoreService } from '../../channels/conversation-core.service';
import type { WapiWebhookPayload } from './wapi-webhook.types';

const noopEventLogger = new Proxy({}, { get: () => () => undefined }) as never;

describe('WapiWebhookService', () => {
  const PHONE_ID_A = 'pn-A';
  const cfgA: ResolvedWebhookConfig = {
    organizationId: 'org-a',
    teamId: 'team-a',
    configId: 'cfg-1',
  };
  const mapA = new Map<string, ResolvedWebhookConfig>([[PHONE_ID_A, cfgA]]);

  let prismaScoped: {
    wapiReport: { findFirst: jest.Mock; update: jest.Mock };
    conversation: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    message: { create: jest.Mock };
    channel: { findFirst: jest.Mock };
    wapiOptOut: { findFirst: jest.Mock; create: jest.Mock };
  };
  let events: { emitToTeamDebounced: jest.Mock; emitToTeam: jest.Mock };
  let media: { fetchInboundMedia: jest.Mock };
  let sender: { sendText: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let optOut: { resolveKeywords: jest.Mock; matchKeyword: jest.Mock; check: jest.Mock; add: jest.Mock };
  let buttonActions: { resolve: jest.Mock; apply: jest.Mock };
  let botEngine: { handle: jest.Mock; isBotButtonId: jest.Mock; endSessionsForConversation: jest.Mock; startTopic: jest.Mock };
  let svc: WapiWebhookService;

  beforeEach(() => {
    const convStub = { id: 'conv-1', status: 'UNASSIGNED', assignedUserId: null, unreadCount: 1 };
    prismaScoped = {
      wapiReport: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      conversation: {
        create: jest.fn().mockResolvedValue(convStub),
        update: jest.fn().mockResolvedValue(convStub),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-1', content: {} }) },
      channel: { findFirst: jest.fn().mockResolvedValue(null) },
      wapiOptOut: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    events = { emitToTeamDebounced: jest.fn(), emitToTeam: jest.fn() };
    media = { fetchInboundMedia: jest.fn() };
    sender = { sendText: jest.fn() };
    encryption = { decrypt: jest.fn((v: string) => v) };
    optOut = {
      resolveKeywords: jest.fn().mockReturnValue([]),
      matchKeyword: jest.fn().mockReturnValue(null),
      check: jest.fn().mockResolvedValue({ optedOut: false }),
      add: jest.fn().mockResolvedValue(undefined),
    };
    buttonActions = {
      resolve: jest.fn().mockResolvedValue(null),
      apply: jest.fn().mockResolvedValue(undefined),
    };
    botEngine = {
      handle: jest.fn().mockResolvedValue({ handled: false }),
      isBotButtonId: jest.fn((id: string | null | undefined) => typeof id === 'string' && id.startsWith('bot:')),
      endSessionsForConversation: jest.fn().mockResolvedValue(undefined),
      startTopic: jest.fn().mockResolvedValue(undefined),
    };
    const botFeature = {
      isEnabled: jest.fn().mockResolvedValue(true),
      isEnvEnabled: jest.fn().mockReturnValue(true),
      isOrgEnabled: jest.fn().mockResolvedValue(true),
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const botRouter = {
      resolve: jest.fn().mockReturnValue(null),
    };
    svc = new WapiWebhookService(
      { scoped: prismaScoped } as never,
      events as never,
      media as never,
      sender as never,
      encryption as never,
      optOut as never,
      buttonActions as never,
      botEngine as never,
      botFeature as never,
      botRouter as never,
      noopEventLogger,
      // Núcleo real con el mismo mock de prisma → preserva la lógica de upsert.
      new ConversationCoreService({ scoped: prismaScoped } as never),
      { notifyInbound: jest.fn(), notifyEscalation: jest.fn() } as never,
    );
  });

  function statusPayload(
    st: string,
    id = 'wamid.A',
    ts = '1714780000',
    errors?: { code: number; title: string; message?: string }[],
    phoneNumberId = PHONE_ID_A,
  ): WapiWebhookPayload {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'biz-1',
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            statuses: [{
              id, recipient_id: '5491100', status: st as 'sent', timestamp: ts,
              ...(errors ? { errors } : {}),
            }],
          },
        }],
      }],
    };
  }

  function inboundPayload(
    msg: Record<string, unknown>,
    contactName = 'Ana',
    phoneNumberId = PHONE_ID_A,
  ): WapiWebhookPayload {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'biz-1',
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            contacts: [{ wa_id: '5491100', profile: { name: contactName } }],
            messages: [msg as never],
          },
        }],
      }],
    };
  }

  it('status delivered → DELIVERED + deliveredAt', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('delivered', 'wamid.A', '1714780000'), mapA);
    expect(prismaScoped.wapiReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({ status: 'DELIVERED', deliveredAt: expect.any(Date) }),
    });
    expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
      'team-a', 'wapi.report.updated', 'camp-1', { campaignId: 'camp-1' },
    );
  });

  it('status read → READ + readAt + deliveredAt si no estaba', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('read'), mapA);
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('READ');
    expect(args.data.readAt).toBeInstanceOf(Date);
    expect(args.data.deliveredAt).toBeInstanceOf(Date);
  });

  it('status read cuando ya está DELIVERED → no setea deliveredAt', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'DELIVERED',
    });
    await svc.process(statusPayload('read'), mapA);
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('READ');
    expect(args.data.deliveredAt).toBeUndefined();
  });

  it('status delivered cuando ya está READ → no retrocede (no update)', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'READ',
    });
    await svc.process(statusPayload('delivered'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('status failed → FAILED + error desde errors[0]', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(
      statusPayload('failed', 'wamid.A', '1714780000', [
        { code: 131026, title: 'Receiver is incapable', message: 'WA no instalado' },
      ]),
      mapA,
    );
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('FAILED');
    expect(args.data.error).toMatch(/131026/);
    expect(args.data.error).toMatch(/Receiver is incapable/);
  });

  it('status sent → no-op (ya SENT desde el ack)', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('sent'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('status sin report → skip sin tirar', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(null);
    await svc.process(statusPayload('delivered'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('mensaje inbound texto → crea conversation + crea message + evento', async () => {
    await svc.process(
      inboundPayload({
        id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
        text: { body: 'hola' },
      }),
      mapA,
    );
    expect(prismaScoped.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalUserId: '5491100', name: 'Ana', unreadCount: 1, channelId: 'cfg-1' }),
      }),
    );
    expect(prismaScoped.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          externalId: 'wamid.IN',
          fromMe: false,
          type: 'text',
          content: { text: { body: 'hola' } },
          status: 'received',
        }),
      }),
    );
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a', 'wapi.message.inbound',
      expect.objectContaining({ conversationId: 'conv-1', phone: '5491100', type: 'text' }),
    );
  });

  it('mensaje duplicado (P2002) → swallow sin tirar', async () => {
    const err = Object.assign(new Error('unique'), { code: 'P2002' });
    prismaScoped.message.create.mockRejectedValueOnce(err);
    await expect(
      svc.process(
        inboundPayload({
          id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'duplicado' },
        }),
        mapA,
      ),
    ).resolves.toBeUndefined();
  });

  it('mensaje image: descarga media + persiste content + campos media', async () => {
    media.fetchInboundMedia.mockResolvedValue({
      sha256: 'sha-image-1',
      size: 1234,
      mime: 'image/jpeg',
      localPath: 'org-a/team-a/sha-image-1.jpg',
    });
    await svc.process(
      inboundPayload({
        id: 'wamid.IM', from: '5491100', timestamp: '1714780000', type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'foto' },
      }),
      mapA,
    );
    expect(media.fetchInboundMedia).toHaveBeenCalledWith('cfg-1', 'media-1');
    const data = prismaScoped.message.create.mock.calls[0]![0].data;
    expect(data.content).toEqual({
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'foto' },
    });
    expect(data.type).toBe('image');
    expect(data.mediaId).toBe('media-1');
    expect(data.mediaSha256).toBe('sha-image-1');
    expect(data.mediaLocalPath).toBe('org-a/team-a/sha-image-1.jpg');
    expect(data.mediaCaption).toBe('foto');
  });

  it('mensaje image: si fetchInboundMedia falla, persiste sin localPath y no tira', async () => {
    media.fetchInboundMedia.mockRejectedValue(new Error('boom'));
    await svc.process(
      inboundPayload({
        id: 'wamid.IM2', from: '5491100', timestamp: '1714780000', type: 'image',
        image: { id: 'media-2', mime_type: 'image/jpeg' },
      }),
      mapA,
    );
    const data = prismaScoped.message.create.mock.calls[0]![0].data;
    expect(data.mediaId).toBe('media-2');
    expect(data.mediaLocalPath).toBeNull();
  });

  it('multi-config: payload con dos phone_number_ids → cada entry usa su tenant', async () => {
    const cfgB: ResolvedWebhookConfig = {
      organizationId: 'org-a',
      teamId: 'team-b',
      configId: 'cfg-2',
    };
    const map = new Map<string, ResolvedWebhookConfig>([
      [PHONE_ID_A, cfgA],
      ['pn-B', cfgB],
    ]);
    const payload: WapiWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'biz-1',
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_ID_A },
              contacts: [{ wa_id: '5491111' }],
              messages: [{ id: 'wamid.A1', from: '5491111', timestamp: '1714780000', type: 'text', text: { body: 'A' } }],
            },
          }],
        },
        {
          id: 'biz-1',
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'pn-B' },
              contacts: [{ wa_id: '5492222' }],
              messages: [{ id: 'wamid.B1', from: '5492222', timestamp: '1714780000', type: 'text', text: { body: 'B' } }],
            },
          }],
        },
      ],
    };
    await svc.process(payload, map);
    expect(prismaScoped.conversation.create).toHaveBeenCalledTimes(2);
    const calls = prismaScoped.conversation.create.mock.calls;
    expect(calls[0]![0].data).toMatchObject({
      teamId: 'team-a', channelId: 'cfg-1', externalUserId: '5491111',
    });
    expect(calls[1]![0].data).toMatchObject({
      teamId: 'team-b', channelId: 'cfg-2', externalUserId: '5492222',
    });
  });

  describe('4.K — button actions', () => {
    beforeEach(() => {
      prismaScoped.channel.findFirst.mockResolvedValue({
        id: 'cfg-1',
        phoneNumberId: 'pn-A',
        accessTokenEnc: 'tok',
        isActive: true,
        isTestMode: true,
        welcomeMessage: null,
        optOutConfirmMessage: 'Listo, te dimos de baja',
        optOutKeywords: null,
      });
    });

    it('interactive button_reply → resolve + apply con context.id', async () => {
      buttonActions.resolve.mockResolvedValueOnce({ action: 'INBOX', source: 'template' });
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN', from: '5491100', timestamp: '1714780000', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'Quiero hablar', title: 'Quiero hablar' } },
          context: { id: 'wamid.OUT' },
        }),
        mapA,
      );
      expect(buttonActions.resolve).toHaveBeenCalledWith({
        buttonId: 'Quiero hablar',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(buttonActions.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          configId: 'cfg-1',
          phone: '5491100',
          action: 'INBOX',
          buttonId: 'Quiero hablar',
          buttonText: 'Quiero hablar',
          contextMetaMessageId: 'wamid.OUT',
        }),
      );
    });

    it('legacy button.payload → resolve con payload como buttonId', async () => {
      buttonActions.resolve.mockResolvedValueOnce({ action: 'IGNORAR', source: 'default' });
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN2', from: '5491100', timestamp: '1714780000', type: 'button',
          button: { payload: 'IGNORAR', text: 'Ok gracias' },
          context: { id: 'wamid.OUT' },
        }),
        mapA,
      );
      expect(buttonActions.resolve).toHaveBeenCalledWith({
        buttonId: 'IGNORAR',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(buttonActions.apply).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IGNORAR', buttonId: 'IGNORAR', buttonText: 'Ok gracias' }),
      );
    });

    it('resolve devuelve null → no apply', async () => {
      buttonActions.resolve.mockResolvedValueOnce(null);
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN3', from: '5491100', timestamp: '1714780000', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'x' } },
        }),
        mapA,
      );
      expect(buttonActions.apply).not.toHaveBeenCalled();
    });

    it('action BAJA → además dispara optOutConfirmMessage si está seteado', async () => {
      buttonActions.resolve.mockResolvedValueOnce({ action: 'BAJA', source: 'template' });
      sender.sendText.mockResolvedValue({ metaMessageId: 'wamid.AUTO' });
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN4', from: '5491100', timestamp: '1714780000', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'No me interesa', title: 'No me interesa' } },
          context: { id: 'wamid.OUT' },
        }),
        mapA,
      );
      expect(buttonActions.apply).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BAJA' }),
      );
      const sentBodies = sender.sendText.mock.calls.map((c) => c[1]?.body);
      expect(sentBodies).toContain('Listo, te dimos de baja');
    });

    it('mensaje de texto NO dispara button actions', async () => {
      await svc.process(
        inboundPayload({
          id: 'wamid.TXT', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'hola' },
        }),
        mapA,
      );
      expect(buttonActions.resolve).not.toHaveBeenCalled();
      expect(buttonActions.apply).not.toHaveBeenCalled();
    });
  });

  describe('4.M — bot guiado', () => {
    beforeEach(() => {
      prismaScoped.channel.findFirst.mockResolvedValue({
        id: 'cfg-1',
        phoneNumberId: 'pn-A',
        accessTokenEnc: 'tok',
        isActive: true,
        isTestMode: true,
        welcomeMessage: 'Bienvenido!',
        optOutConfirmMessage: null,
        optOutKeywords: null,
        // Phase 0a (multi-canal): definición del bot vía relación `bot`.
        bot: {
          enabled: true,
          flow: { startNodeId: 'a', nodes: { a: { kind: 'HANDOFF', text: 'h' } } },
          sessionTtlMin: 30,
          topics: null,
          router: null,
          variables: null,
        },
      });
    });

    it('bot maneja texto inbound → no se dispara welcome ni button actions', async () => {
      botEngine.handle.mockResolvedValue({ handled: true });
      await svc.process(
        inboundPayload({
          id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'hola' },
        }),
        mapA,
      );
      expect(botEngine.handle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cfg-1', botEnabled: true }),
        expect.objectContaining({
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'hola' },
        }),
      );
      // Welcome NO se envió porque botHandled corta el resto.
      expect(sender.sendText).not.toHaveBeenCalled();
    });

    it('button con prefijo bot: → se enruta al engine, no a buttonActions de 4.K', async () => {
      botEngine.handle.mockResolvedValue({ handled: true });
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN', from: '5491100', timestamp: '1714780000', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'bot:soporte', title: 'Soporte' } },
        }),
        mapA,
      );
      expect(botEngine.handle).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          inbound: expect.objectContaining({ kind: 'button', buttonId: 'bot:soporte' }),
        }),
      );
      expect(buttonActions.resolve).not.toHaveBeenCalled();
      expect(buttonActions.apply).not.toHaveBeenCalled();
    });

    it('button SIN prefijo bot: con bot activo → va a buttonActions (4.K)', async () => {
      buttonActions.resolve.mockResolvedValue({ action: 'INBOX', source: 'default' });
      await svc.process(
        inboundPayload({
          id: 'wamid.BTN', from: '5491100', timestamp: '1714780000', type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: 'INBOX', title: 'Hablar' } },
          context: { id: 'wamid.OUT' },
        }),
        mapA,
      );
      expect(botEngine.handle).not.toHaveBeenCalled();
      expect(buttonActions.resolve).toHaveBeenCalledWith({
        buttonId: 'INBOX', contextMetaMessageId: 'wamid.OUT',
      });
      expect(buttonActions.apply).toHaveBeenCalled();
    });

    it('bot termina en HANDOFF con escalate → marca priority + emite update', async () => {
      botEngine.handle.mockResolvedValue({ handled: true, ended: true, escalate: true });
      prismaScoped.conversation.update.mockResolvedValueOnce({
        id: 'conv-1', status: 'UNASSIGNED', assignedUserId: null,
        lastMessageAt: new Date('2026-05-05T10:00:00Z'),
        unreadCount: 1, priority: true,
      });
      await svc.process(
        inboundPayload({
          id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'humano' },
        }),
        mapA,
      );
      const priorityCall = prismaScoped.conversation.update.mock.calls.find(
        (c) => (c[0] as any).data?.priority === true,
      );
      expect(priorityCall).toBeDefined();
      const eventNames = events.emitToTeam.mock.calls.map((c) => c[1]);
      expect(eventNames).toContain('conversation.updated');
    });

    it('si bot devuelve handled=false → flujo normal (welcome de primera conv)', async () => {
      botEngine.handle.mockResolvedValue({ handled: false });
      sender.sendText.mockResolvedValue({ metaMessageId: 'wamid.WELCOME' });
      await svc.process(
        inboundPayload({
          id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'hola' },
        }),
        mapA,
      );
      expect(botEngine.handle).toHaveBeenCalled();
      // Welcome SÍ se envía porque el bot dijo handled=false.
      const sentBodies = sender.sendText.mock.calls.map((c) => c[1]?.body);
      expect(sentBodies).toContain('Bienvenido!');
    });
  });

  it('phone_number_id sin entry en el map → skip esa entry', async () => {
    const payload = inboundPayload({
      id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
      text: { body: 'hola' },
    }, 'Ana', 'pn-FANTASMA');
    await svc.process(payload, mapA);
    expect(prismaScoped.conversation.create).not.toHaveBeenCalled();
    expect(prismaScoped.conversation.update).not.toHaveBeenCalled();
  });
});
