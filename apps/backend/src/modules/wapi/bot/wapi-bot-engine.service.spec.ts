/**
 * Tests del WapiBotEngineService (4.M). Mocks: prisma scoped + events + sender + encryption.
 *
 * Cubre:
 *  - bot deshabilitado → handled=false
 *  - flow inválido → handled=false (no rompe)
 *  - texto inicial sin sesión → entrega startNode (MENU) + crea sesión
 *  - button bot: con sesión → avanza al nextNodeId
 *  - button bot: sin sesión → handled=true (silencioso, no rearma flow)
 *  - button NO bot (template 4.K) → handled=false
 *  - texto con sesión activa → re-muestra MENU actual
 *  - llegada a HANDOFF → cierra sesión, devuelve ended=true + escalate
 *  - sesión expirada → la cierra y rearranca
 *  - botSessionTtlMin se respeta (expiresAt = now + ttl)
 */
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiBotEngineService } from './wapi-bot-engine.service';
import type { BotFlow } from './wapi-bot.types';

const flow: BotFlow = {
  startNodeId: 'menu1',
  nodes: {
    menu1: {
      kind: 'MENU',
      text: '¿En qué te ayudamos?',
      options: [
        { id: 'soporte', label: 'Soporte', nextNodeId: 'menu2' },
        { id: 'humano', label: 'Hablar humano', nextNodeId: 'handoff' },
      ],
    },
    menu2: {
      kind: 'MENU',
      text: 'Elegí un sub-tema',
      options: [{ id: 'volver', label: 'Volver', nextNodeId: 'menu1' }],
    },
    handoff: { kind: 'HANDOFF', text: 'Te derivamos.', escalate: true },
  },
};

const cfg = {
  id: 'cfg-1',
  phoneNumberId: 'pn-1',
  accessTokenEnc: 'enc-token',
  isTestMode: true,
  botEnabled: true,
  botFlow: flow,
  botSessionTtlMin: 30,
};

describe('WapiBotEngineService', () => {
  let prismaScoped: {
    wapiBotSession: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    wapiMessage: { create: jest.Mock };
  };
  let events: { emitToTeam: jest.Mock };
  let sender: { sendInteractiveButtons: jest.Mock; sendText: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let svc: WapiBotEngineService;

  beforeEach(() => {
    prismaScoped = {
      wapiBotSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'sess-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wapiMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1', content: {} }),
      },
    };
    events = { emitToTeam: jest.fn() };
    sender = {
      sendInteractiveButtons: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.OUT', raw: {} }),
      sendText: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.OUT', raw: {} }),
    };
    encryption = { decrypt: jest.fn((v: string) => `dec(${v})`) };
    svc = new WapiBotEngineService(
      { scoped: prismaScoped } as never,
      events as never,
      sender as never,
      encryption as never,
    );
  });

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run(
      { userId: 'u-1', organizationId: 'org-a', teamId: 'team-a', orgRole: 'OWNER', teamRole: 'ADMIN' },
      fn,
    );
  }

  it('bot deshabilitado → handled=false', async () => {
    const out = await withTenant(() =>
      svc.handle({ ...cfg, botEnabled: false }, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(false);
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled();
  });

  it('flow inválido → handled=false', async () => {
    const out = await withTenant(() =>
      svc.handle({ ...cfg, botFlow: { startNodeId: 'noexiste', nodes: {} } }, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(false);
  });

  it('texto inicial sin sesión → entrega startNode + crea sesión', async () => {
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: 'pn-1' }),
      expect.objectContaining({
        to: '5491100',
        body: '¿En qué te ayudamos?',
        buttons: [
          { id: 'bot:soporte', title: 'Soporte' },
          { id: 'bot:humano', title: 'Hablar humano' },
        ],
      }),
    );
    expect(prismaScoped.wapiBotSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          configId: 'cfg-1',
          phone: '5491100',
          currentNodeId: 'menu1',
        }),
      }),
    );
  });

  it('button bot: con sesión → avanza al nextNodeId (menu1 → menu2)', async () => {
    prismaScoped.wapiBotSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'menu1',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
    });
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'button', buttonId: 'bot:soporte', contextMetaMessageId: null },
      }),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Elegí un sub-tema' }),
    );
    expect(prismaScoped.wapiBotSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ currentNodeId: 'menu2' }),
      }),
    );
  });

  it('button bot: sin sesión → handled=true silencioso (no rearma flow)', async () => {
    prismaScoped.wapiBotSession.findFirst.mockResolvedValue(null);
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'button', buttonId: 'bot:humano', contextMetaMessageId: null },
      }),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled();
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it('button NO bot (4.K template) → handled=false (delega al webhook)', async () => {
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'button', buttonId: 'INBOX', contextMetaMessageId: 'wamid.X' },
      }),
    );
    expect(out.handled).toBe(false);
  });

  it('texto con sesión activa → re-muestra MENU actual', async () => {
    prismaScoped.wapiBotSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'menu1',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
    });
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'no entiendo' },
      }),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '¿En qué te ayudamos?' }),
    );
    // No crea nueva sesión, no llama update porque no avanzó.
    expect(prismaScoped.wapiBotSession.create).not.toHaveBeenCalled();
  });

  it('llegada a HANDOFF → ended=true + escalate=true + cierra sesión', async () => {
    prismaScoped.wapiBotSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'menu1',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
    });
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'button', buttonId: 'bot:humano', contextMetaMessageId: null },
      }),
    );
    expect(out.handled).toBe(true);
    expect(out.ended).toBe(true);
    expect(out.escalate).toBe(true);
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Te derivamos.' }),
    );
    expect(prismaScoped.wapiBotSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ endedReason: 'handoff' }),
      }),
    );
  });

  it('sesión expirada → se cierra y se rearranca con startNode', async () => {
    prismaScoped.wapiBotSession.findFirst.mockResolvedValue({
      id: 'sess-old',
      currentNodeId: 'menu2',
      expiresAt: new Date(Date.now() - 1000),
      endedAt: null,
    });
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(true);
    // Cerró la sesión vencida.
    expect(prismaScoped.wapiBotSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-old' },
        data: expect.objectContaining({ endedReason: 'expired' }),
      }),
    );
    // Y entregó el startNode.
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '¿En qué te ayudamos?' }),
    );
  });

  it('MESSAGE → MENU encadena en un solo inbound', async () => {
    const chainFlow: BotFlow = {
      startNodeId: 'intro',
      nodes: {
        intro: { kind: 'MESSAGE', text: 'Hola!', nextNodeId: 'menu1' },
        menu1: {
          kind: 'MENU',
          text: '¿Qué hacemos?',
          options: [{ id: 'h', label: 'Humano', nextNodeId: 'handoff' }],
        },
        handoff: { kind: 'HANDOFF', text: 'Te derivamos.' },
      },
    };
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: chainFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'hola' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Hola!' }),
    );
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '¿Qué hacemos?' }),
    );
    // Sesión queda en MENU final del chain.
    expect(prismaScoped.wapiBotSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentNodeId: 'menu1' }),
      }),
    );
  });

  it('MESSAGE → MESSAGE → HANDOFF cierra sesión y devuelve ended', async () => {
    const chainFlow: BotFlow = {
      startNodeId: 'm1',
      nodes: {
        m1: { kind: 'MESSAGE', text: 'Uno', nextNodeId: 'm2' },
        m2: { kind: 'MESSAGE', text: 'Dos', nextNodeId: 'fin' },
        fin: { kind: 'HANDOFF', text: 'Fin.', escalate: false },
      },
    };
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: chainFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'go' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(out.ended).toBe(true);
    expect(out.escalate).toBe(false);
    expect(sender.sendText).toHaveBeenCalledTimes(3); // m1, m2, fin
    expect(prismaScoped.wapiBotSession.create).not.toHaveBeenCalled();
  });

  it('MESSAGE terminal (sin nextNodeId) entrega y deja sesión en ese nodo', async () => {
    const chainFlow: BotFlow = {
      startNodeId: 'thanks',
      nodes: { thanks: { kind: 'MESSAGE', text: 'Gracias!' } },
    };
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: chainFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'ok' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(out.ended).toBeUndefined();
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Gracias!' }),
    );
    expect(prismaScoped.wapiBotSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentNodeId: 'thanks' }),
      }),
    );
  });

  it('endSessionsForConversation cierra todas las sesiones activas', async () => {
    prismaScoped.wapiBotSession.findMany.mockResolvedValue([{ id: 'sess-a' }, { id: 'sess-b' }]);
    await withTenant(() => svc.endSessionsForConversation('cfg-1', '5491100', 'operator-assign'));
    expect(prismaScoped.wapiBotSession.update).toHaveBeenCalledTimes(2);
    expect(prismaScoped.wapiBotSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-a' },
        data: expect.objectContaining({ endedReason: 'operator-assign' }),
      }),
    );
  });
});
