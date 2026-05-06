/**
 * 4.O.3 — Helpers puros del runtime del bot. Reusables por:
 *  - `WapiBotEngineService` (motor de prod — habla con Meta + DB).
 *  - `WapiBotSandboxService` (sandbox — corre en memoria sin tocar Meta/DB).
 *
 * Mantener acá garantiza que el sandbox interpreta exactamente la misma lógica
 * que prod (un bug en uno se reproduce en el otro). Sin logger, sin DB, sin
 * sender — sólo funciones puras sobre tipos del bot.
 */
import {
  validateBotFlow,
  validateBotRouter,
  validateBotTopics,
  validateBotVariables,
  type BotCaptureNode,
  type BotConditionBranch,
  type BotConditionNode,
  type BotRouter,
  type BotTopic,
  type BotVariable,
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
  const variableDefaults = buildVariableDefaults(input.variables);

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
    return { resolved: { topics: topicsMap, router, variableDefaults }, errors };
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
    return { resolved: { topics: topicsMap, router, variableDefaults }, errors };
  }

  return { resolved: null, errors };
}

/**
 * 4.O.4 — Construye el record de defaults a partir de las variables declaradas.
 * Variables sin defaultValue NO entran al record (queda undefined → motor las
 * trata como '' al interpolar). Si el shape es inválido se devuelve `{}` y se
 * ignora — la validación dura corre al persistir, no al ejecutar.
 */
function buildVariableDefaults(input: unknown): BotData {
  if (!input) return {};
  const v = validateBotVariables(input);
  if (!v.ok || !v.variables) return {};
  const out: BotData = {};
  for (const variable of v.variables) {
    if (variable.defaultValue !== undefined) {
      out[variable.name] = variable.defaultValue;
    }
  }
  return out;
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
