/**
 * Tests del validador de bot flow (4.M). Asegura que rechazamos shapes
 * inválidas antes de persistir, así nunca queda un flow roto en DB que
 * tire al recibir un inbound.
 */
import { validateBotFlow, type BotFlow } from './wapi-bot.types';

describe('validateBotFlow', () => {
  function v(flow: unknown) {
    return validateBotFlow(flow);
  }

  it('flow válido mínimo (1 MENU + 1 HANDOFF)', () => {
    const flow: BotFlow = {
      startNodeId: 'root',
      nodes: {
        root: {
          kind: 'MENU',
          text: 'Hola, ¿en qué te ayudamos?',
          options: [{ id: 'op1', label: 'Hablar con humano', nextNodeId: 'human' }],
        },
        human: { kind: 'HANDOFF', text: 'Te derivamos con un agente.', escalate: true },
      },
    };
    const r = v(flow);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rechaza si no hay startNodeId', () => {
    const r = v({ nodes: {} });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'startNodeId')).toBe(true);
  });

  it('rechaza si startNodeId no existe en nodes', () => {
    const r = v({ startNodeId: 'fantasma', nodes: { other: { kind: 'HANDOFF', text: 'x' } } });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'startNodeId')).toBe(true);
  });

  it('rechaza nextNodeId que apunta a node inexistente', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: { kind: 'MENU', text: 'hi', options: [{ id: '1', label: 'L', nextNodeId: 'fantasma' }] },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('fantasma'))).toBe(true);
  });

  it('rechaza MENU sin opciones', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'MENU', text: 'hi', options: [] } },
    });
    expect(r.ok).toBe(false);
  });

  it('rechaza MENU con más de 3 opciones', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: {
          kind: 'MENU',
          text: 'hi',
          options: [
            { id: '1', label: 'A', nextNodeId: 'a' },
            { id: '2', label: 'B', nextNodeId: 'a' },
            { id: '3', label: 'C', nextNodeId: 'a' },
            { id: '4', label: 'D', nextNodeId: 'a' },
          ],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('máximo 3'))).toBe(true);
  });

  it('rechaza opciones con id duplicado', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: {
          kind: 'MENU',
          text: 'hi',
          options: [
            { id: 'x', label: 'A', nextNodeId: 'a' },
            { id: 'x', label: 'B', nextNodeId: 'a' },
          ],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicado'))).toBe(true);
  });

  it('rechaza node con text vacío', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'HANDOFF', text: '   ' } },
    });
    expect(r.ok).toBe(false);
  });

  it('rechaza kind inválido', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'BLABLA', text: 'x' } },
    });
    expect(r.ok).toBe(false);
  });

  it('acepta MESSAGE con nextNodeId válido', () => {
    const flow: BotFlow = {
      startNodeId: 'msg1',
      nodes: {
        msg1: { kind: 'MESSAGE', text: 'Hola!', nextNodeId: 'menu1' },
        menu1: {
          kind: 'MENU',
          text: '¿Qué necesitás?',
          options: [{ id: 'op', label: 'Op', nextNodeId: 'h' }],
        },
        h: { kind: 'HANDOFF', text: 'Adios.' },
      },
    };
    expect(v(flow).ok).toBe(true);
  });

  it('acepta MESSAGE terminal (sin nextNodeId)', () => {
    const flow: BotFlow = {
      startNodeId: 'msg1',
      nodes: { msg1: { kind: 'MESSAGE', text: 'Gracias!' } },
    };
    expect(v(flow).ok).toBe(true);
  });

  it('rechaza MESSAGE con nextNodeId a node inexistente', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'MESSAGE', text: 'hi', nextNodeId: 'fantasma' } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('fantasma'))).toBe(true);
  });

  it('rechaza MESSAGE con auto-referencia', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'MESSAGE', text: 'hi', nextNodeId: 'a' } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('auto-referencia'))).toBe(true);
  });

  it('rechaza MESSAGE con text vacío', () => {
    const r = v({
      startNodeId: 'a',
      nodes: { a: { kind: 'MESSAGE', text: '' } },
    });
    expect(r.ok).toBe(false);
  });

  // -- 4.N.2 ----

  it('CAPTURE válido con preset email', () => {
    const flow: BotFlow = {
      startNodeId: 'a',
      nodes: {
        a: {
          kind: 'CAPTURE',
          text: 'Tu email?',
          saveAs: 'email',
          validate: { kind: 'preset', preset: 'email' },
          nextNodeId: 'b',
        },
        b: { kind: 'HANDOFF', text: 'Listo' },
      },
    };
    expect(v(flow).ok).toBe(true);
  });

  it('CAPTURE rechaza saveAs inválido', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: { kind: 'CAPTURE', text: 'x', saveAs: '1bad', nextNodeId: 'b' },
        b: { kind: 'HANDOFF', text: 'Listo' },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.endsWith('saveAs'))).toBe(true);
  });

  it('CAPTURE rechaza regex inválida', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: {
          kind: 'CAPTURE',
          text: 'x',
          saveAs: 'v',
          validate: { kind: 'regex', pattern: '[' },
          nextNodeId: 'b',
        },
        b: { kind: 'HANDOFF', text: 'Listo' },
      },
    });
    expect(r.ok).toBe(false);
  });

  it('MEDIA válido con caption', () => {
    const flow: BotFlow = {
      startNodeId: 'a',
      nodes: {
        a: {
          kind: 'MEDIA',
          mediaType: 'image',
          mediaId: 'mid-1',
          caption: 'foto',
          nextNodeId: 'b',
        },
        b: { kind: 'HANDOFF', text: 'fin' },
      },
    };
    expect(v(flow).ok).toBe(true);
  });

  it('MEDIA audio rechaza caption', () => {
    const r = v({
      startNodeId: 'a',
      nodes: {
        a: { kind: 'MEDIA', mediaType: 'audio', mediaId: 'mid', caption: 'no va' },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('audio'))).toBe(true);
  });

  it('CONDITION válido con rama var', () => {
    const flow: BotFlow = {
      startNodeId: 'gate',
      nodes: {
        gate: {
          kind: 'CONDITION',
          branches: [
            { id: 'b1', when: { kind: 'var', var: 'x', op: 'eq', value: 'A' }, nextNodeId: 'a' },
          ],
          elseNextNodeId: 'b',
        },
        a: { kind: 'HANDOFF', text: 'Sí' },
        b: { kind: 'HANDOFF', text: 'No' },
      },
    };
    expect(v(flow).ok).toBe(true);
  });

  it('CONDITION rechaza HH:MM mal formado', () => {
    const r = v({
      startNodeId: 'gate',
      nodes: {
        gate: {
          kind: 'CONDITION',
          branches: [
            { id: 'b1', when: { kind: 'time', between: ['25:00', '30:00'] }, nextNodeId: 'a' },
          ],
        },
        a: { kind: 'HANDOFF', text: 'x' },
      },
    });
    expect(r.ok).toBe(false);
  });

  it('CONDITION rechaza weekday fuera de rango', () => {
    const r = v({
      startNodeId: 'gate',
      nodes: {
        gate: {
          kind: 'CONDITION',
          branches: [{ id: 'b1', when: { kind: 'weekday', days: [7] }, nextNodeId: 'a' }],
        },
        a: { kind: 'HANDOFF', text: 'x' },
      },
    });
    expect(r.ok).toBe(false);
  });
});
