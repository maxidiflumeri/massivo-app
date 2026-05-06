/**
 * 4.O.3 — Helpers puros del runtime del bot. Reusables por:
 *  - `WapiBotEngineService` (motor de prod — habla con Meta + DB).
 *  - `WapiBotSandboxService` (sandbox — corre en memoria sin tocar Meta/DB).
 *
 * Mantener acá garantiza que el sandbox interpreta exactamente la misma lógica
 * que prod (un bug en uno se reproduce en el otro). Sin logger, sin DB, sin
 * sender — sólo funciones puras sobre tipos del bot.
 */
import { interpolate } from './interpolate';
import {
  validateBotFlow,
  validateBotRouter,
  validateBotTopics,
  validateBotVariables,
  type BotCaptureNode,
  type BotConditionBranch,
  type BotConditionNode,
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
 * Coerción:
 * - string: si `node.value` es string, se interpola `{{otraVar}}`. Si es
 *   number/boolean, se castea con String().
 * - number: si `node.value` es number, se asigna tal cual. Si es string, se
 *   interpola y se intenta `Number()`. NaN → se escribe el string crudo (la
 *   interpolación pudo no resolver una var).
 * - boolean: si `node.value` es boolean, se asigna tal cual. Si es string, se
 *   interpola y se evalúa truthy: 'true' / '1' / 'yes' / 'si' / 'sí' = true,
 *   resto = false.
 */
export function applySetVar(
  node: BotSetVarNode,
  data: BotData,
  variableTypes: Map<string, BotVariableType>,
): BotData {
  const declaredType = variableTypes.get(node.varName);
  const raw = node.value;
  let resolved: string | number | boolean;
  if (typeof raw === 'string') {
    resolved = interpolate(raw, data);
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
