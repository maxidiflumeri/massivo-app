/**
 * 4.O.3 — Helpers puros del runtime del bot. Reusables por:
 *  - `WapiBotEngineService` (motor de prod — habla con Meta + DB).
 *  - `WapiBotSandboxService` (sandbox — corre en memoria sin tocar Meta/DB).
 *
 * Mantener acá garantiza que el sandbox interpreta exactamente la misma lógica
 * que prod (un bug en uno se reproduce en el otro). Sin logger, sin DB, sin
 * sender — sólo funciones puras sobre tipos del bot.
 */
import { interpolateAsync } from './interpolate';
import {
  validateBotFlow,
  validateBotRouter,
  validateBotTopics,
  validateBotVariables,
  type BotCaptureNode,
  type BotConditionBranch,
  type BotConditionNode,
  type BotForeachNode,
  type BotHttpNode,
  type BotRouter,
  type BotSetVarNode,
  type BotTopic,
  type BotVariable,
  type BotVariableType,
} from './wapi-bot.types';

export const DEFAULT_TOPIC_ID = 'default';

export type BotData = Record<string, unknown>;

export interface ResolvedFlow {
  topics: Map<string, BotTopic>;
  router: BotRouter | null;
  /**
   * 4.O.4 — Defaults declarados aplicados a session.data al iniciar una nueva
   * sesión (antes de overlay con seedData del router). `{}` si el caller no
   * pasó variables o todas son sin defaultValue.
   */
  variableDefaults: BotData;
  /**
   * 4.O.5 — Tipo declarado por nombre de variable. Usado por `applySetVar` para
   * coercer el valor asignado al tipo correcto. Variables no declaradas no
   * aparecen acá (el SET_VAR escribe el valor sin coercer).
   */
  variableTypes: Map<string, BotVariableType>;
}

export interface ResolveTopicsInput {
  /** Array crudo de topics (validado acá). Si null/undefined, fallback a botFlow. */
  topics: unknown;
  /** Router crudo (validado acá contra los topicIds del set resuelto). */
  router: unknown;
  /** Flow legacy (si topics está vacío, se materializa como topic 'default'). */
  flow: unknown;
  /** 4.O.4 — Variables declaradas (defaults). Crudo, validado acá. Si inválido se ignora. */
  variables?: unknown;
}

export interface ResolveTopicsResult {
  resolved: ResolvedFlow | null;
  /** Errores de validación cuando la resolución falla. Para que el caller logue como prefiera. */
  errors: { scope: 'topics' | 'router' | 'flow'; path: string; message: string }[];
}

/**
 * Materializa el conjunto de topics + router. Prioridad:
 *  1. Si `topics` está seteado y es válido, usar eso (con router validado contra topicIds).
 *  2. Si no, materializar `flow` legacy como un topic `default` + router con
 *     `defaultTopicId='default'` (backward compat con bots pre-4.O.1).
 *  3. Si ninguno está seteado o ambos son inválidos, devolver `resolved: null`.
 *
 * `errors` lleva contexto para que el caller pueda logear o exponer al usuario
 * (engine usa logger.warn; sandbox los devuelve al frontend).
 */
export function resolveTopics(input: ResolveTopicsInput): ResolveTopicsResult {
  const errors: ResolveTopicsResult['errors'] = [];
  const topicsMap = new Map<string, BotTopic>();
  let router: BotRouter | null = null;
  const { defaults: variableDefaults, types: variableTypes } = buildVariableMaps(input.variables);

  if (input.topics) {
    const v = validateBotTopics(input.topics);
    if (!v.ok || !v.topics) {
      for (const e of v.errors) errors.push({ scope: 'topics', path: e.path, message: e.message });
      return { resolved: null, errors };
    }
    for (const t of v.topics) topicsMap.set(t.id, t);
    if (input.router) {
      const ids = new Set(topicsMap.keys());
      const rv = validateBotRouter(input.router, ids);
      if (!rv.ok || !rv.router) {
        for (const e of rv.errors) errors.push({ scope: 'router', path: e.path, message: e.message });
        // Igual que el engine: si el router es inválido, seguimos con topics + router=null
        // (el motor cae al topic 'default' por backward compat). El error queda reportado.
      } else {
        router = rv.router;
      }
    }
    return { resolved: { topics: topicsMap, router, variableDefaults, variableTypes }, errors };
  }

  if (input.flow) {
    const v = validateBotFlow(input.flow);
    if (!v.ok || !v.flow) {
      for (const e of v.errors) errors.push({ scope: 'flow', path: e.path, message: e.message });
      return { resolved: null, errors };
    }
    topicsMap.set(DEFAULT_TOPIC_ID, {
      id: DEFAULT_TOPIC_ID,
      label: 'Default',
      flow: v.flow,
    });
    router = { rules: [], defaultTopicId: DEFAULT_TOPIC_ID };
    return { resolved: { topics: topicsMap, router, variableDefaults, variableTypes }, errors };
  }

  return { resolved: null, errors };
}

/**
 * 4.O.4 — Construye `defaults` (record value-by-name) y `types` (map de
 * type-by-name) a partir de las variables declaradas. Variables sin
 * defaultValue NO entran a `defaults`. Si el shape es inválido se devuelven
 * mapas vacíos — la validación dura corre al persistir, no al ejecutar.
 */
function buildVariableMaps(input: unknown): {
  defaults: BotData;
  types: Map<string, BotVariableType>;
} {
  if (!input) return { defaults: {}, types: new Map() };
  const v = validateBotVariables(input);
  if (!v.ok || !v.variables) return { defaults: {}, types: new Map() };
  const defaults: BotData = {};
  const types = new Map<string, BotVariableType>();
  for (const variable of v.variables) {
    types.set(variable.name, variable.type);
    if (variable.defaultValue !== undefined) {
      defaults[variable.name] = variable.defaultValue;
    }
  }
  return { defaults, types };
}

/**
 * 4.O.4 — Versión expuesta para los specs y para casos donde el caller ya tiene
 * `BotVariable[]` validadas y no quiere re-validar.
 */
export function variableDefaultsFromDeclared(declared: BotVariable[] | null): BotData {
  if (!declared) return {};
  const out: BotData = {};
  for (const v of declared) {
    if (v.defaultValue !== undefined) out[v.name] = v.defaultValue;
  }
  return out;
}

/**
 * 4.O.5 — Aplica un nodo SET_VAR a `data`. Devuelve un nuevo objeto con
 * `node.varName` seteado al valor coerced al tipo declarado (si existe en
 * `variableTypes`). Si la variable no está declarada, escribe el valor crudo
 * (con interpolación si era string).
 *
 * Interpolación: si `node.value` es string, pasa por `interpolateAsync` →
 * soporta tanto `{{var}}` plano como `{{= expr }}` JSONata. Esto permite
 * derivar valores desde paths anidados (ej. body de un HTTP previo) y usarlos
 * en CONDITIONs de variable plana downstream.
 *
 * Coerción:
 * - string: si `node.value` es string, se interpola. Si es number/boolean,
 *   se castea con String().
 * - number: si `node.value` es number, se asigna tal cual. Si es string, se
 *   interpola y se intenta `Number()`. NaN → se escribe el string crudo (la
 *   interpolación pudo no resolver una var).
 * - boolean: si `node.value` es boolean, se asigna tal cual. Si es string, se
 *   interpola y se evalúa truthy: 'true' / '1' / 'yes' / 'si' / 'sí' = true,
 *   resto = false.
 */
export async function applySetVar(
  node: BotSetVarNode,
  data: BotData,
  variableTypes: Map<string, BotVariableType>,
): Promise<BotData> {
  const declaredType = variableTypes.get(node.varName);
  const raw = node.value;
  let resolved: string | number | boolean;
  if (typeof raw === 'string') {
    resolved = await interpolateAsync(raw, data);
  } else {
    resolved = raw;
  }
  if (!declaredType) {
    return { ...data, [node.varName]: resolved };
  }
  if (declaredType === 'string') {
    return {
      ...data,
      [node.varName]: typeof resolved === 'string' ? resolved : String(resolved),
    };
  }
  if (declaredType === 'number') {
    if (typeof resolved === 'number') {
      return { ...data, [node.varName]: resolved };
    }
    if (typeof resolved === 'boolean') {
      return { ...data, [node.varName]: resolved ? 1 : 0 };
    }
    const n = Number(resolved);
    return {
      ...data,
      [node.varName]: Number.isFinite(n) ? n : resolved,
    };
  }
  // boolean
  if (typeof resolved === 'boolean') {
    return { ...data, [node.varName]: resolved };
  }
  if (typeof resolved === 'number') {
    return { ...data, [node.varName]: resolved !== 0 };
  }
  const s = String(resolved).trim().toLowerCase();
  const truthy = s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí';
  return { ...data, [node.varName]: truthy };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 \-().]{6,}$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Procesa la respuesta de un nodo CAPTURE: valida el texto contra preset/regex
 * y, si pasa, devuelve la nueva data con `node.saveAs` populado.
 */
export function handleCapture(
  node: BotCaptureNode,
  raw: string,
  current: BotData,
): { ok: true; data: BotData } | { ok: false } {
  const value = (raw ?? '').trim();
  if (!value) return { ok: false };
  if (node.validate) {
    if (node.validate.kind === 'preset') {
      switch (node.validate.preset) {
        case 'email':
          if (!EMAIL_RE.test(value)) return { ok: false };
          break;
        case 'phone':
          if (!PHONE_RE.test(value)) return { ok: false };
          break;
        case 'number':
          if (!NUMBER_RE.test(value)) return { ok: false };
          break;
        case 'any':
          break;
      }
    } else if (node.validate.kind === 'regex') {
      try {
        if (!new RegExp(node.validate.pattern).test(value)) return { ok: false };
      } catch {
        return { ok: false };
      }
    }
  }
  return { ok: true, data: { ...current, [node.saveAs]: value } };
}

/**
 * 4.N.3 — Resultado de ejecutar un nodo HTTP. Compartido por engine real (que hace
 * la request) y sandbox modo Mock (que lo arma desde `node.mockResponse`).
 */
export interface HttpExecResult {
  ok: boolean;
  status: number;
  body: unknown;
  /** Presente cuando `ok = false`. Códigos posibles: 'mock-undefined', 'rate-limited',
   *  'invalid-url', 'invalid-scheme', 'http-not-allowed-in-prod', 'ssrf-blocked',
   *  'redirect-not-followed', 'timeout', 'network-error', 'response-too-large',
   *  'interpolation-failed', 'feature-disabled'. */
  error?: string;
  durationMs: number;
}

/**
 * 4.N.3 — Aplica el resultado de un nodo HTTP a `session.data`. El objeto crudo
 * va a `data[saveAs]` (accesible vía `{{= saveAs.body.path }}` con JSONata).
 *
 * Para mantener compat con `{{var}}` plano y con `CONDITION.var` que sólo lee
 * tipos primitivos, se flattean status/ok/error en claves derivadas. Si el caller
 * quiere navegar `body`, debe usar la sintaxis de expresión.
 */
export function applyHttpResult(
  node: BotHttpNode,
  data: BotData,
  result: HttpExecResult,
): BotData {
  const out: BotData = {
    ...data,
    [node.saveAs]: result,
    [`${node.saveAs}_ok`]: result.ok,
    [`${node.saveAs}_status`]: result.status,
  };
  if (result.error) out[`${node.saveAs}_error`] = result.error;
  return out;
}

/**
 * 4.P.2 — Estado de iteración de un FOREACH activo. Se persiste como item del
 * stack `data._loops` (LIFO). Permite loops anidados.
 */
export interface LoopFrame {
  /** ID del nodo FOREACH en el flow. Sirve para distinguir frames y como punto de retorno. */
  foreachNodeId: string;
  /** Índice del item actualmente asignado (0-based). */
  index: number;
  /** Snapshot del array materializado (evaluado una vez al entrar al loop). */
  items: unknown[];
  itemVar: string;
  indexVar?: string;
  /** Valor que tenía `itemVar` antes del loop, para restaurarlo al cerrar. */
  prevItem?: unknown;
  prevIndex?: unknown;
}

export interface ForeachStep {
  /** Siguiente nodeId al que saltar (bodyNodeId o doneNodeId o startNodeId del gotoTopic). null si termina sin destino. */
  nextNodeId: string | null;
  /** Si cambió de topic (gotoTopic al terminar). */
  nextTopicId?: string;
  data: BotData;
  /** Código de error si no se pudo procesar. Termina el chain. */
  error?: string;
}

export const LOOPS_KEY = '_loops';
const MAX_FOREACH_ITERATIONS_DEFAULT = 100;
const MAX_NESTED_LOOPS_DEFAULT = 3;

function readMaxIterations(): number {
  const n = Number(process.env.WAPI_BOT_FOREACH_MAX_ITERATIONS);
  return Number.isFinite(n) && n > 0 ? n : MAX_FOREACH_ITERATIONS_DEFAULT;
}

function readMaxNested(): number {
  const n = Number(process.env.WAPI_BOT_FOREACH_MAX_NESTED);
  return Number.isFinite(n) && n > 0 ? n : MAX_NESTED_LOOPS_DEFAULT;
}

/**
 * Obtiene el stack de loops desde `data._loops`. Devuelve copia para mutación segura.
 */
export function getLoopStack(data: BotData): LoopFrame[] {
  const raw = (data as Record<string, unknown>)[LOOPS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => ({ ...(f as LoopFrame) }));
}

export function setLoopStack(data: BotData, stack: LoopFrame[]): BotData {
  return { ...data, [LOOPS_KEY]: stack };
}

/**
 * 4.P.2 — Aplica un step de FOREACH. Idempotente sobre el stack de loops.
 *
 * Casos:
 *  - **Primera entrada al nodo** (no hay frame para este foreachNodeId):
 *    Evalúa `items`. Si array vacío, retorna `nextNodeId = doneNodeId` o gotoTopic.
 *    Si supera `MAX_FOREACH_ITERATIONS`, retorna error `too-many-items`.
 *    Si supera `MAX_NESTED_LOOPS` (depth del stack), retorna error `max-nested-loops`.
 *    Si OK, pushea frame con index=0, asigna `itemVar`/`indexVar` en data, retorna `bodyNodeId`.
 *
 *  - **Re-entrada al mismo nodo** (frame existente):
 *    Incrementa index. Si quedan items, reasigna `itemVar`/`indexVar`, retorna `bodyNodeId`.
 *    Si no quedan, restaura valores previos, popea frame, retorna `doneNodeId`/gotoTopic.
 *
 * El evaluator se inyecta como callback para no acoplar el runtime puro a JSONata.
 */
export async function applyForeach(
  node: BotForeachNode,
  foreachNodeId: string,
  data: BotData,
  evaluator: (expr: string, d: BotData) => Promise<unknown>,
): Promise<ForeachStep> {
  const stack = getLoopStack(data);
  const existingIdx = stack.findIndex((f) => f.foreachNodeId === foreachNodeId);

  if (existingIdx === -1) {
    // Primera entrada al loop.
    if (stack.length >= readMaxNested()) {
      return { nextNodeId: null, data, error: 'max-nested-loops' };
    }
    let evaluated: unknown;
    try {
      evaluated = await evaluator(node.items, data);
    } catch {
      return { nextNodeId: null, data, error: 'items-expr-failed' };
    }
    const arr: unknown[] = Array.isArray(evaluated)
      ? evaluated
      : evaluated === null || evaluated === undefined
        ? []
        : [evaluated];
    if (arr.length === 0) {
      // Loop vacío: avanzar al done sin tocar variables.
      return {
        nextNodeId: node.doneNodeId ?? null,
        ...(node.gotoTopic ? { nextTopicId: node.gotoTopic, nextNodeId: null } : {}),
        data,
      };
    }
    if (arr.length > readMaxIterations()) {
      return { nextNodeId: null, data, error: 'too-many-items' };
    }
    const prevItem = (data as Record<string, unknown>)[node.itemVar];
    const prevIndex = node.indexVar
      ? (data as Record<string, unknown>)[node.indexVar]
      : undefined;
    const frame: LoopFrame = {
      foreachNodeId,
      index: 0,
      items: arr,
      itemVar: node.itemVar,
      indexVar: node.indexVar,
      prevItem,
      prevIndex,
    };
    const nextStack = [...stack, frame];
    const nextData: BotData = { ...data, [LOOPS_KEY]: nextStack, [node.itemVar]: arr[0] };
    if (node.indexVar) nextData[node.indexVar] = 0;
    return { nextNodeId: node.bodyNodeId, data: nextData };
  }

  // Re-entrada: avanzar índice.
  const frame = stack[existingIdx]!;
  const nextIdx = frame.index + 1;
  if (nextIdx < frame.items.length) {
    const updatedFrame: LoopFrame = { ...frame, index: nextIdx };
    const nextStack = [...stack];
    nextStack[existingIdx] = updatedFrame;
    const nextData: BotData = {
      ...data,
      [LOOPS_KEY]: nextStack,
      [frame.itemVar]: frame.items[nextIdx],
    };
    if (frame.indexVar) nextData[frame.indexVar] = nextIdx;
    return { nextNodeId: node.bodyNodeId, data: nextData };
  }

  // Fin del loop: pop frame, restaurar valores previos.
  const remaining = stack.filter((_, i) => i !== existingIdx);
  const restored: BotData = { ...data, [LOOPS_KEY]: remaining };
  if (frame.prevItem === undefined) {
    delete (restored as Record<string, unknown>)[frame.itemVar];
  } else {
    restored[frame.itemVar] = frame.prevItem;
  }
  if (frame.indexVar) {
    if (frame.prevIndex === undefined) {
      delete (restored as Record<string, unknown>)[frame.indexVar];
    } else {
      restored[frame.indexVar] = frame.prevIndex;
    }
  }
  if (node.gotoTopic) {
    return { nextNodeId: null, nextTopicId: node.gotoTopic, data: restored };
  }
  return { nextNodeId: node.doneNodeId ?? null, data: restored };
}

/**
 * 4.P.2 — Cuando un chain cae a un nodo terminal sin next/goto y hay un loop
 * activo en el stack, retorna el nodeId del FOREACH topmost para que el chain
 * salte de vuelta y avance al siguiente item. Si no hay loops, retorna null.
 *
 * Usado por engine y sandbox para implementar el "autoreturn implícito" del body
 * del FOREACH sin que el usuario tenga que cablear manualmente la edge de retorno.
 */
export function nextLoopReturnNode(data: BotData): string | null {
  const stack = getLoopStack(data);
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1]!;
  return top.foreachNodeId;
}

/** Evalúa branches de un nodo CONDITION. Devuelve el destino o null si no hubo match ni else. */
export function pickConditionBranch(
  node: BotConditionNode,
  data: BotData,
  now: Date = new Date(),
): { nextNodeId?: string; gotoTopic?: string } | null {
  for (const b of node.branches) {
    if (matchesBranch(b, data, now)) {
      return { nextNodeId: b.nextNodeId, gotoTopic: b.gotoTopic };
    }
  }
  if (node.elseNextNodeId || node.elseGotoTopic) {
    return { nextNodeId: node.elseNextNodeId, gotoTopic: node.elseGotoTopic };
  }
  return null;
}

function matchesBranch(branch: BotConditionBranch, data: BotData, now: Date): boolean {
  const w = branch.when;
  if (w.kind === 'var') {
    const raw = data[w.var];
    const value = raw === undefined || raw === null ? '' : String(raw);
    switch (w.op) {
      case 'eq':
        return value === w.value;
      case 'neq':
        return value !== w.value;
      case 'contains':
        return value.toLowerCase().includes(w.value.toLowerCase());
      case 'matches':
        try {
          return new RegExp(w.value).test(value);
        } catch {
          return false;
        }
    }
  }
  if (w.kind === 'time') {
    const [from, to] = w.between;
    const cur = now.getHours() * 60 + now.getMinutes();
    const fromMin = parseHHMM(from);
    const toMin = parseHHMM(to);
    if (fromMin === null || toMin === null) return false;
    if (fromMin <= toMin) return cur >= fromMin && cur <= toMin;
    return cur >= fromMin || cur <= toMin;
  }
  if (w.kind === 'weekday') {
    return w.days.includes(now.getDay());
  }
  return false;
}

function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
