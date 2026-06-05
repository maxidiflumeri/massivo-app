/**
 * Tests del BotEngineService (4.M). Mocks: prisma scoped + events + sender + encryption.
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
import { TenantContext } from '../../common/auth/tenant-context';
import { BotEngineService } from './bot-engine.service';
import type { BotFlow } from './bot.types';

// 4.R — EventLogger no se asserta en estos tests; Proxy noop para autocompletar
// cualquier método llamado por el engine (botNodeEntered, botSetVar, etc).
const noopEventLogger = new Proxy({}, { get: () => () => undefined }) as never;

// Fase 1b — el engine envía vía WhatsAppAdapter. Este helper crea un mock-adapter
// que reenvía al `sender` mock, preservando las aserciones existentes sobre
// `sender.sendText/sendInteractiveButtons/sendMediaById`. La traducción
// OutboundMessage→Meta la cubre whatsapp.adapter.spec.ts aparte.
function makeForwardingAdapter(sender: {
  sendInteractiveButtons: jest.Mock;
  sendText: jest.Mock;
  sendMediaById: jest.Mock;
}) {
  return {
    capabilities: {
      interactiveButtons: { supported: true, max: 3 },
      mediaTypes: ['image', 'video', 'audio', 'document'],
      freeformWindow: { enforced: true, hours: 24 },
      templates: true,
    },
    send: jest.fn(
      async (
        conn: { phoneNumberId: string; accessToken: string; isTestMode: boolean },
        msg: Record<string, unknown>,
      ) => {
        const cfg = {
          phoneNumberId: conn.phoneNumberId,
          accessToken: conn.accessToken,
          isTestMode: conn.isTestMode,
        };
        let r: { metaMessageId: string };
        if (msg.kind === 'buttons') {
          r = await sender.sendInteractiveButtons(cfg, {
            to: msg.to,
            body: msg.text,
            header: msg.header,
            footer: msg.footer,
            buttons: msg.buttons,
          });
        } else if (msg.kind === 'media') {
          r = await sender.sendMediaById(cfg, {
            to: msg.to,
            type: msg.mediaType,
            mediaId: msg.mediaId,
            caption: msg.caption,
            filename: msg.filename,
          });
        } else {
          r = await sender.sendText(cfg, {
            to: msg.to,
            body: msg.text,
            previewUrl: msg.previewUrl,
          });
        }
        return { externalMessageId: r.metaMessageId };
      },
    ),
  };
}

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

describe('BotEngineService', () => {
  let prismaScoped: {
    botSession: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    message: { create: jest.Mock };
    conversation: { findUnique: jest.Mock; update: jest.Mock };
  };
  let events: { emitToTeam: jest.Mock };
  let sender: { sendInteractiveButtons: jest.Mock; sendText: jest.Mock; sendMediaById: jest.Mock };
  let encryption: { decrypt: jest.Mock };
  let svc: BotEngineService;

  beforeEach(() => {
    prismaScoped = {
      botSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'sess-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1', content: {} }),
      },
      conversation: {
        // 4.O.6 — guard de botSuspended (1er findUnique) y lectura de status
        // antes del update en HANDOFF (2do findUnique). El mismo mock cubre ambas.
        findUnique: jest.fn().mockResolvedValue({
          botSuspended: false,
          status: 'UNASSIGNED',
          assignedUserId: null,
          lastAssignedUserId: null,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    events = { emitToTeam: jest.fn() };
    sender = {
      sendInteractiveButtons: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.OUT', raw: {} }),
      sendText: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.OUT', raw: {} }),
      sendMediaById: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.OUT', raw: {} }),
    };
    encryption = { decrypt: jest.fn((v: string) => `dec(${v})`) };
    const feature = {
      isEnabled: jest.fn().mockResolvedValue(true),
      isEnvEnabled: jest.fn().mockReturnValue(true),
      isOrgEnabled: jest.fn().mockResolvedValue(true),
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const router = { resolve: jest.fn().mockReturnValue(null) };
    const httpExecutor = {
      execute: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
        durationMs: 0,
      }),
    };
    svc = new BotEngineService(
      { scoped: prismaScoped } as never,
      events as never,
      makeForwardingAdapter(sender) as never,
      encryption as never,
      feature as never,
      router as never,
      httpExecutor as never,
      { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never,
      noopEventLogger,
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
    expect(prismaScoped.botSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_externalUserId: { channelId: 'cfg-1', externalUserId: '5491100' } },
        create: expect.objectContaining({
          channelId: 'cfg-1',
          externalUserId: '5491100',
          currentNodeId: 'menu1',
        }),
        update: expect.objectContaining({ currentNodeId: 'menu1', endedAt: null }),
      }),
    );
  });

  it('button bot: con sesión → avanza al nextNodeId (menu1 → menu2)', async () => {
    prismaScoped.botSession.findFirst.mockResolvedValue({
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
    expect(prismaScoped.botSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId_externalUserId: { channelId: 'cfg-1', externalUserId: '5491100' } },
        update: expect.objectContaining({ currentNodeId: 'menu2' }),
      }),
    );
  });

  it('button bot: sin sesión → handled=true silencioso (no rearma flow)', async () => {
    prismaScoped.botSession.findFirst.mockResolvedValue(null);
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
    prismaScoped.botSession.findFirst.mockResolvedValue({
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
    // No crea nueva sesión, no llama upsert porque no avanzó.
    expect(prismaScoped.botSession.create).not.toHaveBeenCalled();
    expect(prismaScoped.botSession.upsert).not.toHaveBeenCalled();
  });

  it('llegada a HANDOFF → ended=true + escalate=true + cierra sesión', async () => {
    prismaScoped.botSession.findFirst.mockResolvedValue({
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
    expect(prismaScoped.botSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ endedReason: 'handoff' }),
      }),
    );
    // 4.O.6 — además marca conversación como escalated + botSuspended.
    expect(prismaScoped.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({ escalated: true, botSuspended: true }),
      }),
    );
  });

  // -- 4.O.6: bot suspension + reset de status post-RESOLVED -----------------

  it('4.O.6: conversación con botSuspended=true → handled=false (motor mudo)', async () => {
    prismaScoped.conversation.findUnique.mockResolvedValue({
      botSuspended: true,
      status: 'ASSIGNED',
      assignedUserId: 'user-1',
      lastAssignedUserId: null,
    });
    const out = await withTenant(() =>
      svc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(false);
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled();
    expect(sender.sendText).not.toHaveBeenCalled();
    // No tocó la sesión ni la conversación.
    expect(prismaScoped.botSession.findFirst).not.toHaveBeenCalled();
    expect(prismaScoped.conversation.update).not.toHaveBeenCalled();
  });

  it('4.O.6: HANDOFF desde conversación RESOLVED resetea status + reabre al inbox', async () => {
    // 1ra llamada: guard de suspensión (no suspendida, status=RESOLVED).
    // 2da llamada: lectura previa al update en HANDOFF (mismo objeto).
    prismaScoped.conversation.findUnique.mockResolvedValue({
      botSuspended: false,
      status: 'RESOLVED',
      assignedUserId: 'user-1',
      lastAssignedUserId: 'user-1',
    });
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'menu1',
      currentTopicId: null,
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
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
    expect(prismaScoped.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          escalated: true,
          botSuspended: true,
          status: 'UNASSIGNED',
          resolvedAt: null,
          assignedUserId: null,
        }),
      }),
    );
  });

  it('sesión expirada → se cierra y se rearranca con startNode', async () => {
    prismaScoped.botSession.findFirst.mockResolvedValue({
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
    expect(prismaScoped.botSession.update).toHaveBeenCalledWith(
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
    expect(prismaScoped.botSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentNodeId: 'menu1' }),
        update: expect.objectContaining({ currentNodeId: 'menu1' }),
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
    expect(prismaScoped.botSession.create).not.toHaveBeenCalled();
    expect(prismaScoped.botSession.upsert).not.toHaveBeenCalled();
  });

  it('DELAY pausa el tiempo configurado y avanza al siguiente nodo sin enviar mensaje', async () => {
    const delayMs = 150;
    const flow: BotFlow = {
      startNodeId: 'm1',
      nodes: {
        m1: { kind: 'MESSAGE', text: 'Uno', nextNodeId: 'wait' },
        wait: { kind: 'DELAY', ms: delayMs, nextNodeId: 'fin' },
        fin: { kind: 'HANDOFF', text: 'Fin.', escalate: false },
      },
    };
    const t0 = Date.now();
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: flow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'go' },
        },
      ),
    );
    const elapsed = Date.now() - t0;
    expect(out.handled).toBe(true);
    expect(out.ended).toBe(true);
    // El DELAY pausa al menos `delayMs`; tolerancia de 100ms por overhead del runtime.
    expect(elapsed).toBeGreaterThanOrEqual(delayMs);
    // DELAY no envía mensaje propio: solo m1 + fin.
    expect(sender.sendText).toHaveBeenCalledTimes(2);
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
    expect(prismaScoped.botSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentNodeId: 'thanks' }),
        update: expect.objectContaining({ currentNodeId: 'thanks' }),
      }),
    );
  });

  // -- 4.N.2: CAPTURE / MEDIA / CONDITION + interpolación ----------------------

  it('CAPTURE: texto valida (preset email) → guarda en data + avanza', async () => {
    const captureFlow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: {
          kind: 'CAPTURE',
          text: 'Tu email?',
          saveAs: 'email',
          validate: { kind: 'preset', preset: 'email' },
          nextNodeId: 'thanks',
        },
        thanks: { kind: 'MESSAGE', text: 'Gracias {{email}}!' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: captureFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'maxi@ejemplo.com' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Gracias maxi@ejemplo.com!' }),
    );
    expect(prismaScoped.botSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ data: { email: 'maxi@ejemplo.com' } }),
      }),
    );
  });

  it('CAPTURE: validación falla con retryNodeId → entrega retry, no avanza', async () => {
    const captureFlow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: {
          kind: 'CAPTURE',
          text: 'Tu email?',
          saveAs: 'email',
          validate: { kind: 'preset', preset: 'email' },
          nextNodeId: 'thanks',
          retryNodeId: 'oops',
        },
        oops: { kind: 'MESSAGE', text: 'Email inválido', nextNodeId: 'ask' },
        thanks: { kind: 'MESSAGE', text: 'Gracias' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: captureFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'no-es-mail' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    // Entregó "Email inválido" + chain a "ask" (re-prompt).
    const bodies = sender.sendText.mock.calls.map((c) => c[1].body);
    expect(bodies).toEqual(expect.arrayContaining(['Email inválido', 'Tu email?']));
    // Sesión queda en "ask" (re-prompt).
    expect(prismaScoped.botSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ currentNodeId: 'ask' }),
      }),
    );
  });

  it('CAPTURE: validación falla sin retryNodeId → re-entrega prompt, no avanza', async () => {
    const captureFlow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: {
          kind: 'CAPTURE',
          text: 'Tu número?',
          saveAs: 'n',
          validate: { kind: 'preset', preset: 'number' },
          nextNodeId: 'thanks',
        },
        thanks: { kind: 'MESSAGE', text: 'OK' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: captureFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'abc' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Tu número?' }),
    );
    // No persistió data porque no validó.
    expect(prismaScoped.botSession.update).not.toHaveBeenCalled();
  });

  it('MEDIA: envía sendMediaById con caption interpolado y avanza', async () => {
    const mediaFlow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: {
          kind: 'CAPTURE',
          text: 'Tu nombre?',
          saveAs: 'nombre',
          nextNodeId: 'pdf',
        },
        pdf: {
          kind: 'MEDIA',
          mediaType: 'document',
          mediaId: 'mid-123',
          caption: 'Hola {{nombre}}',
          filename: 'guia.pdf',
          nextNodeId: 'fin',
        },
        fin: { kind: 'HANDOFF', text: 'Listo' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: mediaFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'Maxi' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(out.ended).toBe(true);
    expect(sender.sendMediaById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'document',
        mediaId: 'mid-123',
        caption: 'Hola Maxi',
        filename: 'guia.pdf',
      }),
    );
  });

  it('CONDITION: rama var matchea → salta a su nextNodeId (sin entregar)', async () => {
    const condFlow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: {
          kind: 'CAPTURE',
          text: 'Tipo?',
          saveAs: 'tipo',
          nextNodeId: 'gate',
        },
        gate: {
          kind: 'CONDITION',
          branches: [
            {
              id: 'b1',
              when: { kind: 'var', var: 'tipo', op: 'eq', value: 'A' },
              nextNodeId: 'pathA',
            },
          ],
          elseNextNodeId: 'pathB',
        },
        pathA: { kind: 'MESSAGE', text: 'Sos A' },
        pathB: { kind: 'MESSAGE', text: 'Sos B' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: condFlow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'A' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Sos A' }),
    );
    // pathB no se entregó.
    const bodies = sender.sendText.mock.calls.map((c) => c[1].body);
    expect(bodies).not.toContain('Sos B');
  });

  it('SET_VAR (4.O.5): asigna valor con interpolación, no entrega mensaje, avanza al next', async () => {
    const flow: BotFlow = {
      startNodeId: 'ask',
      nodes: {
        ask: { kind: 'CAPTURE', text: 'Tu nombre?', saveAs: 'nombre', nextNodeId: 'set' },
        set: {
          kind: 'SET_VAR',
          varName: 'saludo',
          value: 'Hola {{nombre}}',
          nextNodeId: 'gate',
        },
        gate: {
          kind: 'CONDITION',
          branches: [
            {
              id: 'b1',
              when: { kind: 'var', var: 'saludo', op: 'eq', value: 'Hola Juan' },
              nextNodeId: 'yes',
            },
          ],
          elseNextNodeId: 'no',
        },
        yes: { kind: 'MESSAGE', text: 'Hola Juan!' },
        no: { kind: 'MESSAGE', text: 'no match' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'ask',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: flow },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'Juan' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    const bodies = sender.sendText.mock.calls.map((c) => c[1].body);
    // SET_VAR no envía mensaje, gate evalúa "Hola Juan" === "Hola Juan" → branch yes.
    expect(bodies).toContain('Hola Juan!');
    expect(bodies).not.toContain('no match');
  });

  it('SET_VAR (4.O.5): coerce a number cuando la variable está declarada como number', async () => {
    const flow: BotFlow = {
      startNodeId: 'set',
      nodes: {
        set: {
          kind: 'SET_VAR',
          varName: 'edad',
          value: '42', // string, debe coercer a 42 (number)
          nextNodeId: 'gate',
        },
        gate: {
          kind: 'CONDITION',
          branches: [
            {
              id: 'b1',
              when: { kind: 'var', var: 'edad', op: 'eq', value: '42' },
              nextNodeId: 'yes',
            },
          ],
          elseNextNodeId: 'no',
        },
        yes: { kind: 'MESSAGE', text: 'OK' },
        no: { kind: 'MESSAGE', text: 'NO' },
      },
    };
    prismaScoped.botSession.findFirst.mockResolvedValue(null);
    const out = await withTenant(() =>
      svc.handle(
        {
          ...cfg,
          botFlow: flow,
          botVariables: [{ name: 'edad', type: 'number' }],
        },
        {
          configId: 'cfg-1',
          conversationId: 'conv-1',
          phone: '5491100',
          inbound: { kind: 'text', body: 'hola' },
        },
      ),
    );
    expect(out.handled).toBe(true);
    const bodies = sender.sendText.mock.calls.map((c) => c[1].body);
    expect(bodies).toContain('OK');
  });

  it('CONDITION: ninguna rama → elseNextNodeId', async () => {
    const condFlow: BotFlow = {
      startNodeId: 'gate',
      nodes: {
        gate: {
          kind: 'CONDITION',
          branches: [
            { id: 'b1', when: { kind: 'var', var: 'x', op: 'eq', value: 'sí' }, nextNodeId: 'a' },
          ],
          elseNextNodeId: 'b',
        },
        a: { kind: 'MESSAGE', text: 'Sí' },
        b: { kind: 'MESSAGE', text: 'No' },
      },
    };
    const out = await withTenant(() =>
      svc.handle(
        { ...cfg, botFlow: condFlow },
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
      expect.objectContaining({ body: 'No' }),
    );
  });

  it('4.O.2 — keyword router-restart: matchea con sesión activa, la cierra y arranca el topic matched', async () => {
    // Sesión activa en topic A node "msg-a" (no MENU/CAPTURE → invalid-state path).
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-old',
      currentNodeId: 'msg-a',
      currentTopicId: 'a',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    // Router devuelve match keyword → topic 'b'.
    const routerMock = {
      resolve: jest.fn().mockReturnValue({
        topicId: 'b',
        seedData: { producto: 'X' },
        via: 'keyword',
      }),
    };
    const feature = {
      isEnabled: jest.fn().mockResolvedValue(true),
      isEnvEnabled: jest.fn().mockReturnValue(true),
      isOrgEnabled: jest.fn().mockResolvedValue(true),
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const localSvc = new BotEngineService(
      { scoped: prismaScoped } as never,
      events as never,
      makeForwardingAdapter(sender) as never,
      encryption as never,
      feature as never,
      routerMock as never,
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
          durationMs: 0,
        }),
      } as never,
      { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never,
      noopEventLogger,
    );
    const cfgMulti = {
      ...cfg,
      botFlow: null,
      botTopics: [
        {
          id: 'a',
          label: 'Tema A',
          flow: {
            startNodeId: 'msg-a',
            nodes: { 'msg-a': { kind: 'MESSAGE', text: 'En A' } },
          },
        },
        {
          id: 'b',
          label: 'Tema B',
          flow: {
            startNodeId: 'msg-b',
            nodes: { 'msg-b': { kind: 'MESSAGE', text: 'Hola desde B {{producto}}' } },
          },
        },
      ],
      botRouter: {
        rules: [{ kind: 'keyword', keywords: ['hola'], topicId: 'b' }],
      },
    };
    const out = await withTenant(() =>
      localSvc.handle(cfgMulti, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'hola' },
      }),
    );
    expect(out.handled).toBe(true);
    expect(routerMock.resolve).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'text', text: 'hola' },
    );
    // Cerró la sesión vieja con reason router-restart.
    expect(prismaScoped.botSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-old' },
        data: expect.objectContaining({ endedReason: 'router-restart' }),
      }),
    );
    // Entregó el msg-b del topic B con seedData interpolado.
    expect(sender.sendText).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Hola desde B X' }),
    );
  });

  it('4.O.2 — keyword fallback (via=fallback) NO interrumpe MENU activo', async () => {
    prismaScoped.botSession.findFirst.mockResolvedValue({
      id: 'sess-1',
      currentNodeId: 'menu1',
      currentTopicId: 'default',
      expiresAt: new Date(Date.now() + 60_000),
      endedAt: null,
      data: {},
    });
    const routerMock = {
      resolve: jest.fn().mockReturnValue({
        topicId: 'other',
        seedData: {},
        via: 'fallback',
      }),
    };
    const feature = {
      isEnabled: jest.fn().mockResolvedValue(true),
      isEnvEnabled: jest.fn().mockReturnValue(true),
      isOrgEnabled: jest.fn().mockResolvedValue(true),
      assertEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const localSvc = new BotEngineService(
      { scoped: prismaScoped } as never,
      events as never,
      makeForwardingAdapter(sender) as never,
      encryption as never,
      feature as never,
      routerMock as never,
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
          durationMs: 0,
        }),
      } as never,
      { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never,
      noopEventLogger,
    );
    const out = await withTenant(() =>
      localSvc.handle(cfg, {
        configId: 'cfg-1',
        conversationId: 'conv-1',
        phone: '5491100',
        inbound: { kind: 'text', body: 'no entiendo' },
      }),
    );
    expect(out.handled).toBe(true);
    // No cerró sesión por router-restart.
    expect(prismaScoped.botSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endedReason: 'router-restart' }),
      }),
    );
    // Re-entregó el menú actual (MENU activo).
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: '¿En qué te ayudamos?' }),
    );
  });

  it('endSessionsForConversation cierra todas las sesiones activas', async () => {
    prismaScoped.botSession.findMany.mockResolvedValue([{ id: 'sess-a' }, { id: 'sess-b' }]);
    await withTenant(() => svc.endSessionsForConversation('cfg-1', '5491100', 'operator-assign'));
    expect(prismaScoped.botSession.update).toHaveBeenCalledTimes(2);
    expect(prismaScoped.botSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-a' },
        data: expect.objectContaining({ endedReason: 'operator-assign' }),
      }),
    );
  });
});
