import {
  applyForeach,
  applyHttpResult,
  getLoopStack,
  LOOPS_KEY,
  nextLoopReturnNode,
  type BotData,
  type HttpExecResult,
} from './bot-flow-runtime';
import type { BotForeachNode, BotHttpNode } from './wapi-bot.types';

const ORIG_ENV = { ...process.env };

describe('applyHttpResult', () => {
  it('escribe saveAs + flattens ok/status/error', () => {
    const node: BotHttpNode = {
      kind: 'HTTP',
      method: 'GET',
      url: 'https://x.com',
      saveAs: 'r',
    };
    const result: HttpExecResult = {
      ok: true,
      status: 200,
      body: { nombre: 'Juan' },
      durationMs: 42,
    };
    const out = applyHttpResult(node, { keep: 'me' }, result);
    expect(out.keep).toBe('me');
    expect(out.r).toEqual(result);
    expect(out.r_ok).toBe(true);
    expect(out.r_status).toBe(200);
    expect(out.r_error).toBeUndefined();
  });

  it('flattens error code cuando ok=false', () => {
    const node: BotHttpNode = {
      kind: 'HTTP',
      method: 'GET',
      url: 'https://x.com',
      saveAs: 'r',
    };
    const result: HttpExecResult = {
      ok: false,
      status: 0,
      body: null,
      error: 'timeout',
      durationMs: 5000,
    };
    const out = applyHttpResult(node, {}, result);
    expect(out.r_ok).toBe(false);
    expect(out.r_status).toBe(0);
    expect(out.r_error).toBe('timeout');
  });
});

describe('applyForeach', () => {
  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  function makeNode(overrides: Partial<BotForeachNode> = {}): BotForeachNode {
    return {
      kind: 'FOREACH',
      items: 'items',
      itemVar: 'item',
      bodyNodeId: 'body1',
      ...overrides,
    };
  }

  const arrayEvaluator = (expr: string, data: BotData): Promise<unknown> => {
    // Evaluator dummy: lee data[expr] como array.
    return Promise.resolve((data as Record<string, unknown>)[expr]);
  };

  it('primera entrada con array no vacío: asigna primer item y va a bodyNodeId', async () => {
    const step = await applyForeach(
      makeNode(),
      'fe1',
      { items: ['a', 'b', 'c'] },
      arrayEvaluator,
    );
    expect(step.nextNodeId).toBe('body1');
    expect(step.error).toBeUndefined();
    expect(step.data.item).toBe('a');
    const stack = getLoopStack(step.data);
    expect(stack).toHaveLength(1);
    expect(stack[0]!.index).toBe(0);
    expect(stack[0]!.items).toEqual(['a', 'b', 'c']);
  });

  it('re-entrada avanza el índice', async () => {
    const s1 = await applyForeach(
      makeNode(),
      'fe1',
      { items: ['a', 'b', 'c'] },
      arrayEvaluator,
    );
    const s2 = await applyForeach(makeNode(), 'fe1', s1.data, arrayEvaluator);
    expect(s2.nextNodeId).toBe('body1');
    expect(s2.data.item).toBe('b');
    expect(getLoopStack(s2.data)[0]!.index).toBe(1);
  });

  it('al terminar la última iteración pop frame y va a doneNodeId', async () => {
    let d: BotData = { items: ['a', 'b'] };
    const node = makeNode({ doneNodeId: 'after' });
    const s1 = await applyForeach(node, 'fe1', d, arrayEvaluator);
    d = s1.data;
    const s2 = await applyForeach(node, 'fe1', d, arrayEvaluator);
    d = s2.data;
    const s3 = await applyForeach(node, 'fe1', d, arrayEvaluator);
    expect(s3.nextNodeId).toBe('after');
    expect(getLoopStack(s3.data)).toHaveLength(0);
    expect((s3.data as Record<string, unknown>).item).toBeUndefined();
  });

  it('restaura el valor previo de itemVar/indexVar al salir', async () => {
    const node = makeNode({ doneNodeId: 'after', indexVar: 'i' });
    const start: BotData = { items: ['x'], item: 'PREVIO', i: 999 };
    const s1 = await applyForeach(node, 'fe1', start, arrayEvaluator);
    expect(s1.data.item).toBe('x'); // dentro del loop
    expect(s1.data.i).toBe(0);
    const s2 = await applyForeach(node, 'fe1', s1.data, arrayEvaluator);
    expect(s2.data.item).toBe('PREVIO'); // restaurado
    expect(s2.data.i).toBe(999);
  });

  it('array vacío: nextNodeId = doneNodeId sin tocar el stack ni vars', async () => {
    const step = await applyForeach(
      makeNode({ doneNodeId: 'after' }),
      'fe1',
      { items: [] },
      arrayEvaluator,
    );
    expect(step.nextNodeId).toBe('after');
    expect(getLoopStack(step.data)).toHaveLength(0);
    expect((step.data as Record<string, unknown>).item).toBeUndefined();
  });

  it('items no-array se castean a [items] (singleton)', async () => {
    const step = await applyForeach(
      makeNode(),
      'fe1',
      { items: 'solo-uno' },
      arrayEvaluator,
    );
    expect(step.nextNodeId).toBe('body1');
    expect(step.data.item).toBe('solo-uno');
    expect(getLoopStack(step.data)[0]!.items).toEqual(['solo-uno']);
  });

  it('items null o undefined → array vacío', async () => {
    const step = await applyForeach(
      makeNode({ doneNodeId: 'after' }),
      'fe1',
      { items: null },
      arrayEvaluator,
    );
    expect(step.nextNodeId).toBe('after');
  });

  it('evaluator que tira → error items-expr-failed', async () => {
    const failingEvaluator = (): Promise<never> => Promise.reject(new Error('boom'));
    const step = await applyForeach(makeNode(), 'fe1', {}, failingEvaluator);
    expect(step.nextNodeId).toBe(null);
    expect(step.error).toBe('items-expr-failed');
  });

  it('cap MAX_FOREACH_ITERATIONS → error too-many-items', async () => {
    process.env.WAPI_BOT_FOREACH_MAX_ITERATIONS = '3';
    const bigArr = [1, 2, 3, 4, 5];
    const step = await applyForeach(makeNode(), 'fe1', { items: bigArr }, arrayEvaluator);
    expect(step.error).toBe('too-many-items');
  });

  it('cap MAX_NESTED_LOOPS → error max-nested-loops', async () => {
    process.env.WAPI_BOT_FOREACH_MAX_NESTED = '2';
    // Pre-poblamos stack con 2 frames "como si" hubiera 2 loops activos.
    const data: BotData = {
      [LOOPS_KEY]: [
        { foreachNodeId: 'fe-prev-1', index: 0, items: [1], itemVar: 'a' },
        { foreachNodeId: 'fe-prev-2', index: 0, items: [1], itemVar: 'b' },
      ],
      items: ['x'],
    };
    const step = await applyForeach(makeNode(), 'fe-new', data, arrayEvaluator);
    expect(step.error).toBe('max-nested-loops');
  });

  it('gotoTopic al terminar el loop devuelve nextTopicId', async () => {
    const node = makeNode({ gotoTopic: 'otro-tema' });
    const s1 = await applyForeach(node, 'fe1', { items: ['a'] }, arrayEvaluator);
    const s2 = await applyForeach(node, 'fe1', s1.data, arrayEvaluator);
    expect(s2.nextTopicId).toBe('otro-tema');
    expect(s2.nextNodeId).toBe(null);
  });

  it('asigna indexVar cuando está declarado', async () => {
    const node = makeNode({ indexVar: 'i' });
    const s1 = await applyForeach(node, 'fe1', { items: ['x', 'y'] }, arrayEvaluator);
    expect(s1.data.i).toBe(0);
    const s2 = await applyForeach(node, 'fe1', s1.data, arrayEvaluator);
    expect(s2.data.i).toBe(1);
  });

  it('loops anidados independientes (frames distintos por foreachNodeId)', async () => {
    let d: BotData = { items: ['a', 'b'], inner: [1, 2] };
    const outer = makeNode({ itemVar: 'o' });
    const inner = makeNode({ items: 'inner', itemVar: 'i', bodyNodeId: 'inner-body' });
    // Entrar outer.
    d = (await applyForeach(outer, 'fe-out', d, arrayEvaluator)).data;
    expect(d.o).toBe('a');
    // Entrar inner.
    d = (await applyForeach(inner, 'fe-in', d, arrayEvaluator)).data;
    expect(d.i).toBe(1);
    expect(getLoopStack(d)).toHaveLength(2);
    // Avanzar inner.
    d = (await applyForeach(inner, 'fe-in', d, arrayEvaluator)).data;
    expect(d.i).toBe(2);
    // Salir inner.
    d = (await applyForeach(inner, 'fe-in', d, arrayEvaluator)).data;
    expect(getLoopStack(d)).toHaveLength(1); // sólo outer queda
    expect(d.i).toBeUndefined();
    expect(d.o).toBe('a'); // outer no se tocó
    // Avanzar outer.
    d = (await applyForeach(outer, 'fe-out', d, arrayEvaluator)).data;
    expect(d.o).toBe('b');
    // Salir outer.
    d = (await applyForeach(outer, 'fe-out', d, arrayEvaluator)).data;
    expect(getLoopStack(d)).toHaveLength(0);
  });
});

describe('nextLoopReturnNode', () => {
  it('retorna null sin loops activos', () => {
    expect(nextLoopReturnNode({})).toBeNull();
  });

  it('retorna el foreachNodeId topmost del stack', () => {
    const data: BotData = {
      [LOOPS_KEY]: [
        { foreachNodeId: 'outer', index: 0, items: [1], itemVar: 'a' },
        { foreachNodeId: 'inner', index: 0, items: [1], itemVar: 'b' },
      ],
    };
    expect(nextLoopReturnNode(data)).toBe('inner');
  });
});
