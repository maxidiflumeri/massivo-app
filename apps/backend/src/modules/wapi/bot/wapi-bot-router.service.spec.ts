import { WapiBotRouterService } from './wapi-bot-router.service';
import type { BotRouter } from './wapi-bot.types';

describe('WapiBotRouterService', () => {
  const svc = new WapiBotRouterService();

  it('matchea template-payload con regex sin named groups', () => {
    const router: BotRouter = {
      rules: [{ kind: 'template-payload', pattern: '^OFERTA_X$', topicId: 'oferta' }],
    };
    const r = svc.resolve(router, { kind: 'template-payload', payload: 'OFERTA_X' });
    expect(r).toEqual({ topicId: 'oferta', seedData: {}, via: 'template-payload' });
  });

  it('matchea template-payload e inyecta named groups en seedData', () => {
    const router: BotRouter = {
      rules: [
        {
          kind: 'template-payload',
          pattern: '^OFERTA_(?<producto>\\w+)_(?<plan>\\d+)$',
          topicId: 'oferta',
        },
      ],
    };
    const r = svc.resolve(router, {
      kind: 'template-payload',
      payload: 'OFERTA_HOSTING_99',
    });
    expect(r).toEqual({
      topicId: 'oferta',
      seedData: { producto: 'HOSTING', plan: '99' },
      via: 'template-payload',
    });
  });

  it('matchea keyword case-insensitive y exacto (no parcial)', () => {
    const router: BotRouter = {
      rules: [
        { kind: 'keyword', keywords: ['hola', 'buenas tardes'], topicId: 'bienvenida' },
      ],
    };
    expect(svc.resolve(router, { kind: 'text', text: 'Hola' })).toEqual({
      topicId: 'bienvenida',
      seedData: {},
      via: 'keyword',
    });
    expect(svc.resolve(router, { kind: 'text', text: '  buenas tardes  ' })).toEqual({
      topicId: 'bienvenida',
      seedData: {},
      via: 'keyword',
    });
    expect(svc.resolve(router, { kind: 'text', text: 'hola que tal' })).toBeNull();
  });

  it('keyword no matchea en input template-payload (kinds distintos)', () => {
    const router: BotRouter = {
      rules: [{ kind: 'keyword', keywords: ['hola'], topicId: 'bienvenida' }],
    };
    expect(svc.resolve(router, { kind: 'template-payload', payload: 'hola' })).toBeNull();
  });

  it('default rule sin condicion siempre matchea (ultimo recurso)', () => {
    const router: BotRouter = {
      rules: [
        { kind: 'keyword', keywords: ['hola'], topicId: 'bienvenida' },
        { kind: 'default', topicId: 'fallback' },
      ],
    };
    expect(svc.resolve(router, { kind: 'text', text: 'cualquier cosa' })).toEqual({
      topicId: 'fallback',
      seedData: {},
      via: 'default',
    });
  });

  it('defaultTopicId atajo cae si no hay match', () => {
    const router: BotRouter = {
      rules: [{ kind: 'keyword', keywords: ['hola'], topicId: 'bienvenida' }],
      defaultTopicId: 'fallback',
    };
    expect(svc.resolve(router, { kind: 'text', text: 'otra cosa' })).toEqual({
      topicId: 'fallback',
      seedData: {},
      via: 'fallback',
    });
  });

  it('primer match gana (orden importa)', () => {
    const router: BotRouter = {
      rules: [
        { kind: 'keyword', keywords: ['humano'], topicId: 'handoff' },
        { kind: 'default', topicId: 'bot' },
      ],
    };
    expect(svc.resolve(router, { kind: 'text', text: 'humano' })).toEqual({
      topicId: 'handoff',
      seedData: {},
      via: 'keyword',
    });
  });

  it('regex inválida ignora la rule sin tirar', () => {
    const router: BotRouter = {
      rules: [
        { kind: 'template-payload', pattern: '[invalid(', topicId: 'broken' },
        { kind: 'default', topicId: 'fallback' },
      ],
    };
    expect(svc.resolve(router, { kind: 'template-payload', payload: 'X' })).toEqual({
      topicId: 'fallback',
      seedData: {},
      via: 'default',
    });
  });

  it('router null devuelve null', () => {
    expect(svc.resolve(null, { kind: 'text', text: 'x' })).toBeNull();
  });
});
