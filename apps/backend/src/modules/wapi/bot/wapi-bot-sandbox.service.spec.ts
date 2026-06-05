/**
 * 4.O.3 — Tests del sandbox del bot. Verifican que:
 *  - El sandbox usa `botTopicsDraft` cuando existe (con fallback a `botTopics`).
 *  - El chain de nodos (MESSAGE → MENU) genera el array de mensajes esperado.
 *  - CAPTURE válido avanza la sesión; inválido reentrega el mismo nodo.
 *  - `reset: true` borra la sesión.
 *  - Aislamiento multi-tenant: la sesión de un userId/configId no es visible para otro.
 *  - El sandbox NO toca prisma.scoped.botSession (sólo lee el WapiConfig).
 */
import { WapiBotSandboxService } from './wapi-bot-sandbox.service';
import { WapiBotRouterService } from './wapi-bot-router.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';
import type { BotTopic, BotRouter } from './wapi-bot.types';

function ctxA(): RequestContext {
  return { organizationId: 'org-A', teamId: 'team-A', userId: 'user-A' } as unknown as RequestContext;
}
function ctxB(): RequestContext {
  return { organizationId: 'org-B', teamId: 'team-B', userId: 'user-B' } as unknown as RequestContext;
}

// Phase 0a (multi-canal): la definición del bot vive en la entidad `Bot`. Los
// tests setean `row` con nombres `bot*` (legacy); el mock lo envuelve en el shape
// `{ id, bot: {...} }` que `loadConfig` ahora selecciona vía la relación `bot`.
function makePrisma(row: Record<string, unknown> | null) {
  const wrapped =
    row === null
      ? null
      : {
          id: row.id,
          bot: {
            flow: row.botFlow ?? null,
            topics: row.botTopics ?? null,
            router: row.botRouter ?? null,
            topicsDraft: row.botTopicsDraft ?? null,
            routerDraft: row.botRouterDraft ?? null,
            variables: row.botVariables ?? null,
            variablesDraft: row.botVariablesDraft ?? null,
          },
        };
  return {
    scoped: {
      channel: {
        findFirst: jest.fn(async () => wrapped),
      },
    },
  } as never;
}

const router = new WapiBotRouterService();

const greetTopic: BotTopic = {
  id: 'greet',
  label: 'Greet',
  flow: {
    startNodeId: 'msg1',
    nodes: {
      msg1: { kind: 'MESSAGE', text: '¡Hola {{nombre}}!', nextNodeId: 'menu1' },
      menu1: {
        kind: 'MENU',
        text: '¿Qué necesitás?',
        options: [
          { id: 'a', label: 'Ventas', nextNodeId: 'ask' },
          { id: 'b', label: 'Soporte', nextNodeId: 'fin' },
        ],
      },
      ask: {
        kind: 'CAPTURE',
        text: 'Decime tu email',
        saveAs: 'email',
        validate: { kind: 'preset', preset: 'email' },
        nextNodeId: 'fin',
      },
      fin: { kind: 'HANDOFF', text: 'Te derivamos.', escalate: true },
    },
  },
};

const draftTopic: BotTopic = {
  id: 'greet',
  label: 'Greet',
  flow: {
    startNodeId: 'msg1',
    nodes: {
      msg1: { kind: 'MESSAGE', text: '¡Hola DESDE DRAFT!', nextNodeId: 'fin' },
      fin: { kind: 'HANDOFF', text: 'Bye.', escalate: false },
    },
  },
};

const router1: BotRouter = { rules: [], defaultTopicId: 'greet' };

describe('WapiBotSandboxService', () => {
  it('usa botTopicsDraft cuando existe; chain MESSAGE → MENU produce 2 mensajes', async () => {
    const prisma = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: [greetTopic],
      botRouter: router1,
      botTopicsDraft: [draftTopic],
      botRouterDraft: { rules: [], defaultTopicId: 'greet' },
    });
    const svc = new WapiBotSandboxService(prisma, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      const r = await svc.step('cfg-1', { phone: '5491100', inbound: { kind: 'text', body: 'hola' } });
      expect(r.sourceUsed).toBe('draft');
      // Draft: MESSAGE → HANDOFF, sólo 2 mensajes.
      expect(r.messages.map((m) => m.body)).toEqual(['¡Hola DESDE DRAFT!', 'Bye.']);
      // HANDOFF cierra sesión.
      expect(r.session).toBeNull();
    });
  });

  it('source=published fuerza usar botTopics aunque haya draft', async () => {
    const prisma = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: [greetTopic],
      botRouter: router1,
      botTopicsDraft: [draftTopic],
      botRouterDraft: { rules: [], defaultTopicId: 'greet' },
    });
    const svc = new WapiBotSandboxService(prisma, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      const r = await svc.step('cfg-1', {
        phone: '5491100',
        source: 'published',
        inbound: { kind: 'text', body: 'hola' },
      });
      expect(r.sourceUsed).toBe('published');
      // Published: MESSAGE → MENU. Sesión queda en menu1.
      expect(r.messages).toHaveLength(2);
      expect(r.messages[0]?.body).toBe('¡Hola !');
      expect(r.messages[1]?.type).toBe('interactive');
      expect(r.messages[1]?.buttons).toHaveLength(2);
      expect(r.session?.nodeId).toBe('menu1');
    });
  });

  it('CAPTURE inválido reentrega el mismo nodo y no avanza sesión', async () => {
    const prisma = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: [greetTopic],
      botRouter: router1,
      botTopicsDraft: null,
      botRouterDraft: null,
    });
    const svc = new WapiBotSandboxService(prisma, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      // 1) Texto entra → MESSAGE + MENU.
      await svc.step('cfg-1', { phone: '5491100', inbound: { kind: 'text', body: 'hola' } });
      // 2) Click "Ventas" → CAPTURE pidiendo email.
      const r2 = await svc.step('cfg-1', {
        phone: '5491100',
        inbound: { kind: 'button', buttonId: 'bot:a' },
      });
      expect(r2.session?.nodeId).toBe('ask');
      // 3) Texto inválido (no email) → reentrega CAPTURE sin avanzar.
      const r3 = await svc.step('cfg-1', {
        phone: '5491100',
        inbound: { kind: 'text', body: 'no-es-email' },
      });
      expect(r3.session?.nodeId).toBe('ask');
      expect(r3.messages).toHaveLength(1);
      expect(r3.messages[0]?.nodeId).toBe('ask');
      // 4) Texto válido → CAPTURE pasa, va a HANDOFF, sesión termina.
      const r4 = await svc.step('cfg-1', {
        phone: '5491100',
        inbound: { kind: 'text', body: 'foo@bar.com' },
      });
      expect(r4.session).toBeNull();
      expect(r4.messages.at(-1)?.handoff).toEqual({ escalate: true });
    });
  });

  it('reset: true borra la sesión antes del próximo input', async () => {
    const prisma = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: [greetTopic],
      botRouter: router1,
      botTopicsDraft: null,
      botRouterDraft: null,
    });
    const svc = new WapiBotSandboxService(prisma, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      await svc.step('cfg-1', { phone: '5491100', inbound: { kind: 'text', body: 'hola' } });
      const before = await svc.step('cfg-1', { phone: '5491100' });
      expect(before.session?.nodeId).toBe('menu1');

      const after = await svc.step('cfg-1', {
        phone: '5491100',
        reset: true,
        resetOnly: true,
      });
      expect(after.session).toBeNull();
    });
  });

  it('aislamiento multi-tenant: orgs distintos no comparten sesión sandbox', async () => {
    const prismaA = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: [greetTopic],
      botRouter: router1,
      botTopicsDraft: null,
      botRouterDraft: null,
    });
    const svc = new WapiBotSandboxService(prismaA, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      await svc.step('cfg-1', { phone: '5491100', inbound: { kind: 'text', body: 'hola' } });
      const peek = await svc.step('cfg-1', { phone: '5491100' });
      expect(peek.session?.nodeId).toBe('menu1');
    });

    // Mismo configId, mismo phone, otra org. La sesión NO debería existir.
    await TenantContext.run(ctxB(), async () => {
      const peekOtherOrg = await svc.step('cfg-1', { phone: '5491100' });
      expect(peekOtherOrg.session).toBeNull();
    });
  });

  it('si no hay draft ni botTopics ni botFlow, devuelve unavailable', async () => {
    const prisma = makePrisma({
      id: 'cfg-1',
      botFlow: null,
      botTopics: null,
      botRouter: null,
      botTopicsDraft: null,
      botRouterDraft: null,
    });
    const svc = new WapiBotSandboxService(prisma, router, { execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: null, durationMs: 0 }) } as never, { execute: jest.fn().mockResolvedValue({ ok: false, error: 'mock-undefined', durationMs: 0 }) } as never);

    await TenantContext.run(ctxA(), async () => {
      const r = await svc.step('cfg-1', { phone: '5491100', inbound: { kind: 'text', body: 'x' } });
      expect(r.unavailable).toBe(true);
      expect(r.sourceUsed).toBe('none');
    });
  });
});
