import jsonata from 'jsonata';
import type { BotFlow, BotRouter, BotTopic, BotVariable } from './types';

export interface ValidationError {
  path: string;
  message: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const TOPIC_ID_RE = /^[a-zA-Z0-9_-]+$/;

function checkRef(
  flow: BotFlow,
  selfId: string,
  ref: string | undefined | null,
  path: string,
  errors: ValidationError[],
  required: boolean,
) {
  if (ref === undefined || ref === null || ref === '') {
    if (required) errors.push({ path, message: 'requerido' });
    return;
  }
  if (!flow.nodes[ref]) {
    errors.push({ path, message: `node "${ref}" no existe` });
    return;
  }
  if (ref === selfId) {
    errors.push({ path, message: 'auto-referencia (loop)' });
  }
}

function checkGoto(
  ref: string | undefined,
  topicIds: ReadonlySet<string> | undefined,
  path: string,
  errors: ValidationError[],
): boolean {
  if (!ref) return false;
  if (!topicIds) return true; // sólo validamos forma (en aislado no chequeamos cross-topic)
  if (!topicIds.has(ref)) {
    errors.push({ path, message: `topic "${ref}" no existe` });
  }
  return true;
}

/**
 * Espejo cliente del validateBotFlow del backend (validación rápida en el
 * editor antes de pegar al server). Si esto pasa, el backend también pasa.
 *
 * 4.O.1 — `topicIds` opcional: si se pasa, valida que todos los `gotoTopic`
 * referencien topics existentes. En modo aislado (sin topicIds) sólo se chequea
 * que la forma sea correcta y que cada salida tenga `nextNodeId` o `gotoTopic`.
 */
export function validateClient(
  flow: BotFlow,
  topicIds?: ReadonlySet<string>,
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (!flow.startNodeId) {
    errors.push({ path: 'startNodeId', message: 'Falta nodo inicial' });
  } else if (!flow.nodes[flow.startNodeId]) {
    errors.push({ path: 'startNodeId', message: 'El nodo inicial no existe' });
  }
  for (const [id, node] of Object.entries(flow.nodes)) {
    if (
      node.kind !== 'MEDIA' &&
      node.kind !== 'MEDIA_FROM_URL' &&
      node.kind !== 'CONDITION' &&
      node.kind !== 'SET_VAR' &&
      node.kind !== 'HTTP' &&
      node.kind !== 'FOREACH' &&
      node.kind !== 'DELAY'
    ) {
      if (!(node as { text?: string }).text || (node as { text: string }).text.trim().length === 0) {
        errors.push({ path: `nodes.${id}.text`, message: 'Texto vacío' });
      }
    }
    if (node.kind === 'MENU') {
      if (node.options.length === 0) {
        errors.push({ path: `nodes.${id}.options`, message: 'MENU sin opciones' });
      }
      if (node.options.length > 3) {
        errors.push({ path: `nodes.${id}.options`, message: 'máximo 3 opciones' });
      }
      const ids = new Set<string>();
      for (const opt of node.options) {
        if (!opt.id) {
          errors.push({ path: `nodes.${id}.options`, message: 'opción sin id' });
        } else if (ids.has(opt.id)) {
          errors.push({ path: `nodes.${id}.options`, message: `id duplicado "${opt.id}"` });
        }
        ids.add(opt.id);
        if (!opt.label || opt.label.trim().length === 0) {
          errors.push({ path: `nodes.${id}.options.${opt.id}`, message: 'sin etiqueta' });
        }
        const hasGoto = checkGoto(
          opt.gotoTopic,
          topicIds,
          `nodes.${id}.options.${opt.id}.gotoTopic`,
          errors,
        );
        if (opt.nextNodeId && opt.nextNodeId !== '') {
          if (!flow.nodes[opt.nextNodeId]) {
            errors.push({
              path: `nodes.${id}.options.${opt.id}`,
              message: `nextNodeId "${opt.nextNodeId}" no existe`,
            });
          }
        } else if (!hasGoto) {
          errors.push({
            path: `nodes.${id}.options.${opt.id}`,
            message: 'nextNodeId o gotoTopic requerido',
          });
        }
      }
    } else if (node.kind === 'MESSAGE') {
      checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
      if (node.nextNodeId !== undefined && node.nextNodeId !== '') {
        if (node.nextNodeId === id) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: 'auto-referencia (loop)',
          });
        } else if (!flow.nodes[node.nextNodeId]) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: `nextNodeId "${node.nextNodeId}" no existe`,
          });
        }
      }
    } else if (node.kind === 'CAPTURE') {
      if (!node.saveAs || !node.saveAs.trim()) {
        errors.push({ path: `nodes.${id}.saveAs`, message: 'requerido' });
      } else if (!VAR_NAME_RE.test(node.saveAs)) {
        errors.push({ path: `nodes.${id}.saveAs`, message: 'nombre inválido' });
      }
      const hasGoto = checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
      if (node.nextNodeId && node.nextNodeId !== '') {
        checkRef(flow, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, true);
      } else if (!hasGoto) {
        errors.push({ path: `nodes.${id}.nextNodeId`, message: 'nextNodeId o gotoTopic requerido' });
      }
      checkRef(flow, id, node.retryNodeId, `nodes.${id}.retryNodeId`, errors, false);
      if (node.validate?.kind === 'regex') {
        if (!node.validate.pattern) {
          errors.push({ path: `nodes.${id}.validate.pattern`, message: 'requerido' });
        } else {
          try {
            new RegExp(node.validate.pattern);
          } catch {
            errors.push({ path: `nodes.${id}.validate.pattern`, message: 'regex inválida' });
          }
        }
      }
    } else if (node.kind === 'MEDIA') {
      if (!node.mediaId || !node.mediaId.trim()) {
        errors.push({ path: `nodes.${id}.mediaId`, message: 'falta archivo (subí uno)' });
      }
      if (node.mediaType === 'audio' && node.caption) {
        errors.push({ path: `nodes.${id}.caption`, message: 'audio no admite caption' });
      }
      checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
      checkRef(flow, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, false);
    } else if (node.kind === 'SET_VAR') {
      if (!node.varName || !node.varName.trim()) {
        errors.push({ path: `nodes.${id}.varName`, message: 'requerido' });
      } else if (!VAR_NAME_RE.test(node.varName)) {
        errors.push({ path: `nodes.${id}.varName`, message: 'nombre inválido' });
      }
      const tv = typeof node.value;
      if (tv !== 'string' && tv !== 'number' && tv !== 'boolean') {
        errors.push({ path: `nodes.${id}.value`, message: 'string|number|boolean' });
      } else if (tv === 'number' && !Number.isFinite(node.value as number)) {
        errors.push({ path: `nodes.${id}.value`, message: 'number debe ser finito' });
      }
      const hasGoto = checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
      if (node.nextNodeId && node.nextNodeId !== '') {
        checkRef(flow, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, true);
      } else if (!hasGoto) {
        errors.push({
          path: `nodes.${id}.nextNodeId`,
          message: 'nextNodeId o gotoTopic requerido',
        });
      }
    } else if (node.kind === 'CONDITION') {
      if (node.branches.length === 0) {
        errors.push({ path: `nodes.${id}.branches`, message: 'al menos 1 rama' });
      }
      const seen = new Set<string>();
      node.branches.forEach((b, i) => {
        const bp = `nodes.${id}.branches[${i}]`;
        if (!b.id) errors.push({ path: `${bp}.id`, message: 'id requerido' });
        else if (seen.has(b.id)) errors.push({ path: `${bp}.id`, message: 'id duplicado' });
        else seen.add(b.id);
        const hasGoto = checkGoto(b.gotoTopic, topicIds, `${bp}.gotoTopic`, errors);
        if (b.nextNodeId && b.nextNodeId !== '') {
          checkRef(flow, id, b.nextNodeId, `${bp}.nextNodeId`, errors, true);
        } else if (!hasGoto) {
          errors.push({ path: `${bp}.nextNodeId`, message: 'nextNodeId o gotoTopic requerido' });
        }
        const w = b.when;
        if (!w) {
          errors.push({ path: `${bp}.when`, message: 'requerido' });
          return;
        }
        if (w.kind === 'var') {
          if (!w.var || !VAR_NAME_RE.test(w.var)) {
            errors.push({ path: `${bp}.when.var`, message: 'nombre inválido' });
          }
          if (typeof w.value !== 'string') {
            errors.push({ path: `${bp}.when.value`, message: 'requerido' });
          } else if (w.op === 'matches') {
            try {
              new RegExp(w.value);
            } catch {
              errors.push({ path: `${bp}.when.value`, message: 'regex inválida' });
            }
          }
        } else if (w.kind === 'time') {
          if (!Array.isArray(w.between) || w.between.length !== 2) {
            errors.push({ path: `${bp}.when.between`, message: 'esperado [HH:MM, HH:MM]' });
          } else {
            w.between.forEach((s, k) => {
              if (typeof s !== 'string' || !HHMM_RE.test(s)) {
                errors.push({ path: `${bp}.when.between[${k}]`, message: 'HH:MM' });
              }
            });
          }
        } else if (w.kind === 'weekday') {
          if (!Array.isArray(w.days) || w.days.length === 0) {
            errors.push({ path: `${bp}.when.days`, message: 'al menos 1 día' });
          } else {
            w.days.forEach((d, k) => {
              if (!Number.isInteger(d) || d < 0 || d > 6) {
                errors.push({ path: `${bp}.when.days[${k}]`, message: '0..6' });
              }
            });
          }
        }
      });
      checkGoto(node.elseGotoTopic, topicIds, `nodes.${id}.elseGotoTopic`, errors);
      checkRef(flow, id, node.elseNextNodeId, `nodes.${id}.elseNextNodeId`, errors, false);
    } else if (node.kind === 'HTTP') {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(node.method)) {
        errors.push({ path: `nodes.${id}.method`, message: 'método inválido' });
      }
      if (!node.url || !node.url.trim()) {
        errors.push({ path: `nodes.${id}.url`, message: 'requerido' });
      } else {
        const hasTokens = /\{\{/.test(node.url);
        if (!hasTokens) {
          try {
            const u = new URL(node.url);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
              errors.push({ path: `nodes.${id}.url`, message: 'esperado http:// o https://' });
            }
          } catch {
            errors.push({ path: `nodes.${id}.url`, message: 'URL absoluta inválida' });
          }
        }
      }
      if (!node.saveAs || !node.saveAs.trim()) {
        errors.push({ path: `nodes.${id}.saveAs`, message: 'requerido' });
      } else if (!VAR_NAME_RE.test(node.saveAs)) {
        errors.push({ path: `nodes.${id}.saveAs`, message: 'nombre inválido' });
      }
      if (node.timeoutMs !== undefined && node.timeoutMs !== null) {
        if (
          typeof node.timeoutMs !== 'number' ||
          !Number.isInteger(node.timeoutMs) ||
          node.timeoutMs < 100 ||
          node.timeoutMs > 10_000
        ) {
          errors.push({ path: `nodes.${id}.timeoutMs`, message: 'entero 100..10000 ms' });
        }
      }
      if (node.mockResponse) {
        const s = node.mockResponse.status;
        if (!Number.isInteger(s) || s < 100 || s > 599) {
          errors.push({
            path: `nodes.${id}.mockResponse.status`,
            message: 'entero 100..599',
          });
        }
      }
      checkRef(flow, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, false);
      checkRef(flow, id, node.errorNodeId, `nodes.${id}.errorNodeId`, errors, false);
      checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
      checkGoto(node.errorGotoTopic, topicIds, `nodes.${id}.errorGotoTopic`, errors);
    } else if (node.kind === 'FOREACH') {
      if (!node.items || !node.items.trim()) {
        errors.push({ path: `nodes.${id}.items`, message: 'requerido (expresión JSONata)' });
      } else {
        try {
          jsonata(node.items);
        } catch (e) {
          errors.push({
            path: `nodes.${id}.items`,
            message: `JSONata inválida: ${(e as Error).message.slice(0, 80)}`,
          });
        }
      }
      if (!node.itemVar || !node.itemVar.trim()) {
        errors.push({ path: `nodes.${id}.itemVar`, message: 'requerido' });
      } else if (!VAR_NAME_RE.test(node.itemVar)) {
        errors.push({ path: `nodes.${id}.itemVar`, message: 'nombre inválido' });
      }
      if (node.indexVar && !VAR_NAME_RE.test(node.indexVar)) {
        errors.push({ path: `nodes.${id}.indexVar`, message: 'nombre inválido' });
      }
      if (!node.bodyNodeId || !node.bodyNodeId.trim()) {
        errors.push({ path: `nodes.${id}.bodyNodeId`, message: 'requerido' });
      } else if (!flow.nodes[node.bodyNodeId]) {
        errors.push({
          path: `nodes.${id}.bodyNodeId`,
          message: `node "${node.bodyNodeId}" no existe`,
        });
      } else if (node.bodyNodeId === id) {
        errors.push({ path: `nodes.${id}.bodyNodeId`, message: 'auto-referencia (loop)' });
      }
      checkRef(flow, id, node.doneNodeId, `nodes.${id}.doneNodeId`, errors, false);
      checkGoto(node.gotoTopic, topicIds, `nodes.${id}.gotoTopic`, errors);
    } else if (node.kind === 'DELAY') {
      if (typeof node.ms !== 'number' || !Number.isFinite(node.ms)) {
        errors.push({ path: `nodes.${id}.ms`, message: 'entero requerido' });
      } else if (node.ms < 100 || node.ms > 10000) {
        errors.push({ path: `nodes.${id}.ms`, message: 'entero 100..10000 ms' });
      }
      checkRef(flow, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, true);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valida un array de BotTopic con cross-check de gotoTopic refs.
 * Devuelve errores con path `topics[<id>].flow.<path-original>` para mostrar
 * por tab.
 */
export function validateTopics(topics: BotTopic[]): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (topics.length === 0) {
    errors.push({ path: 'topics', message: 'al menos 1 topic' });
    return { ok: false, errors };
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const tp = `topics[${i}]`;
    if (!t.id || !t.id.trim()) {
      errors.push({ path: `${tp}.id`, message: 'requerido' });
    } else if (!TOPIC_ID_RE.test(t.id)) {
      errors.push({ path: `${tp}.id`, message: 'sólo letras, números, _ o -' });
    } else if (seenIds.has(t.id)) {
      errors.push({ path: `${tp}.id`, message: `id duplicado: ${t.id}` });
    } else {
      seenIds.add(t.id);
    }
    if (!t.label || !t.label.trim()) {
      errors.push({ path: `${tp}.label`, message: 'requerido' });
    }
  }
  for (const t of topics) {
    const flowResult = validateClient(t.flow, seenIds);
    for (const e of flowResult.errors) {
      errors.push({ path: `topics[${t.id}].${e.path}`, message: e.message });
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valida BotRouter. `topicIds` debe pasarse para chequear que las rules
 * referencien topics que existen.
 */
export function validateRouter(
  router: BotRouter,
  topicIds: ReadonlySet<string>,
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const checkTopic = (id: string | undefined, path: string) => {
    if (!id || !id.trim()) {
      errors.push({ path, message: 'topicId requerido' });
      return;
    }
    if (!topicIds.has(id)) {
      errors.push({ path, message: `topic inexistente: ${id}` });
    }
  };
  let defaultsSeen = 0;
  router.rules.forEach((r, i) => {
    const rp = `rules[${i}]`;
    if (r.kind === 'template-payload') {
      if (!r.pattern) {
        errors.push({ path: `${rp}.pattern`, message: 'regex requerida' });
      } else {
        try {
          new RegExp(r.pattern);
        } catch {
          errors.push({ path: `${rp}.pattern`, message: 'regex inválida' });
        }
      }
      checkTopic(r.topicId, `${rp}.topicId`);
    } else if (r.kind === 'keyword') {
      if (!Array.isArray(r.keywords) || r.keywords.length === 0) {
        errors.push({ path: `${rp}.keywords`, message: 'al menos 1 keyword' });
      } else if (r.keywords.some((k) => typeof k !== 'string' || !k.trim())) {
        errors.push({ path: `${rp}.keywords`, message: 'keywords no vacíos' });
      }
      checkTopic(r.topicId, `${rp}.topicId`);
    } else if (r.kind === 'default') {
      defaultsSeen++;
      checkTopic(r.topicId, `${rp}.topicId`);
    } else {
      errors.push({ path: `${rp}.kind`, message: 'kind inválido' });
    }
  });
  if (defaultsSeen > 1) {
    errors.push({ path: 'rules', message: 'sólo 1 rule "default" tiene sentido' });
  }
  if (router.defaultTopicId !== undefined) {
    checkTopic(router.defaultTopicId, 'defaultTopicId');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 4.O.4 — Espejo cliente del backend `validateBotVariables`. Bloquea publish si
 * algún declarado tiene shape inválido. Las referencias `{{x}}` no declaradas
 * se reportan como warnings (no errors) y NO bloquean publish.
 */
export function validateVariables(variables: BotVariable[]): {
  ok: boolean;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  variables.forEach((v, i) => {
    const p = `variables[${i}]`;
    if (!v.name || !v.name.trim()) {
      errors.push({ path: `${p}.name`, message: 'requerido' });
    } else if (!VAR_NAME_RE.test(v.name)) {
      errors.push({ path: `${p}.name`, message: 'nombre inválido' });
    } else if (seen.has(v.name)) {
      errors.push({ path: `${p}.name`, message: `nombre duplicado: ${v.name}` });
    } else {
      seen.add(v.name);
    }
    if (v.type !== 'string' && v.type !== 'number' && v.type !== 'boolean') {
      errors.push({ path: `${p}.type`, message: 'string | number | boolean' });
    }
    if (v.description !== undefined && typeof v.description !== 'string') {
      errors.push({ path: `${p}.description`, message: 'debe ser string' });
    }
    if (v.defaultValue !== undefined) {
      const t = typeof v.defaultValue;
      if (v.type === 'string' && t !== 'string') {
        errors.push({ path: `${p}.defaultValue`, message: 'esperado string' });
      } else if (v.type === 'number' && (t !== 'number' || !Number.isFinite(v.defaultValue))) {
        errors.push({ path: `${p}.defaultValue`, message: 'esperado number finito' });
      } else if (v.type === 'boolean' && t !== 'boolean') {
        errors.push({ path: `${p}.defaultValue`, message: 'esperado boolean' });
      }
    }
  });
  return { ok: errors.length === 0, errors };
}
