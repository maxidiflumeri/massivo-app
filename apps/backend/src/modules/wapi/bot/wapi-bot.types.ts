/**
 * Tipos del bot guiado por número (4.N + 4.N.2). El flow se persiste como JSON
 * en `WapiConfig.botFlow`. Tipos de nodos:
 *  - **MENU**: muestra un mensaje + hasta 3 opciones (botones interactive).
 *    Cada opción tiene un `nextNodeId` que define a dónde ir cuando el cliente
 *    la elige.
 *  - **MESSAGE**: envía un texto plano (sin botones). Si tiene `nextNodeId`,
 *    el motor avanza automáticamente al siguiente nodo (puede encadenar varios
 *    MESSAGE antes de llegar a un MENU/CAPTURE/HANDOFF). Si no tiene
 *    `nextNodeId`, es terminal silencioso (la sesión queda abierta hasta TTL).
 *  - **CAPTURE** (4.N.2): manda un prompt y queda esperando texto libre del
 *    cliente. Lo guarda en `session.data[saveAs]` (con validación opcional —
 *    regex o presets email/phone/number/any). Si valida, avanza a `nextNodeId`;
 *    si no valida y hay `retryNodeId`, salta ahí (típicamente otro MESSAGE
 *    "formato inválido" → vuelve al CAPTURE). Sin `retryNodeId`, vuelve a sí
 *    mismo en silencio.
 *  - **MEDIA** (4.N.2): envía un attachment (image/video/document/audio) usando
 *    un `mediaId` ya subido a Meta vía `WapiSenderService.sendMediaById`.
 *    Reusa la infra de upload de 4.F.2.d. Avanza igual que MESSAGE.
 *  - **CONDITION** (4.N.2): no envía mensaje. Evalúa ramas en orden y salta a
 *    la primera que matchea. Tipos de condición: `var` (compara
 *    `session.data[var]` vs valor), `time` (HH:MM..HH:MM en horario actual),
 *    `weekday` (días 0..6, 0=domingo). `elseNextNodeId` es el fallback si
 *    ninguna rama matchea.
 *  - **HANDOFF**: nodo terminal — manda el mensaje final y cierra la sesión
 *    del bot. La conversación queda en el inbox para que un operador la tome
 *    (con `priority=true` si `escalate=true`).
 *
 * El motor identifica selecciones por `optionId` (id del button reply de Meta).
 * Convención: option ids tienen el prefijo `bot:` para distinguirlos de los
 * button ids de templates de campañas (4.K) y evitar colisiones.
 *
 * `position` opcional en cada nodo es metadata del editor visual (react-flow):
 * el motor la ignora pero la persiste para que el flow se renderice igual
 * tras recargar.
 *
 * **Interpolación** (4.N.2): `text`, `caption`, `header`, `footer` admiten
 * `{{varName}}` que se reemplaza por `session.data[varName]` antes de enviar.
 * Si la variable no existe, se reemplaza por '' (no rompe).
 */

export const BOT_OPTION_PREFIX = 'bot:';

/**
 * Profundidad máxima de encadenamiento automático
 * (MESSAGE → MEDIA → CONDITION → ...). Sirve para cortar loops accidentales
 * si el editor permite ciclos.
 */
export const BOT_MAX_AUTO_CHAIN = 8;

export type BotNodeKind = 'MENU' | 'MESSAGE' | 'HANDOFF' | 'CAPTURE' | 'MEDIA' | 'CONDITION';

export interface BotNodePosition {
  x: number;
  y: number;
}

export interface BotMenuOption {
  /** ID interno único dentro del nodo. El motor lo prefija con `bot:` al armar el button id. */
  id: string;
  label: string;
  nextNodeId?: string;
  /** 4.O.1 — alternativo a nextNodeId. Si está, salta al startNodeId del tema. */
  gotoTopic?: string;
}

export interface BotMenuNode {
  kind: 'MENU';
  text: string;
  options: BotMenuOption[];
  header?: string;
  footer?: string;
  position?: BotNodePosition;
}

export interface BotMessageNode {
  kind: 'MESSAGE';
  text: string;
  /** Si está seteado, el motor avanza solo al recibirlo. Si no, queda esperando. */
  nextNodeId?: string;
  /** 4.O.1 — alternativo a nextNodeId. Salta a otro tema (a su startNodeId). */
  gotoTopic?: string;
  position?: BotNodePosition;
}

export interface BotHandoffNode {
  kind: 'HANDOFF';
  text: string;
  /** Si true, marca la conversación como priority al cerrar la sesión. */
  escalate?: boolean;
  position?: BotNodePosition;
}

// 4.N.2 — CAPTURE
export type BotCaptureValidatePreset = 'email' | 'phone' | 'number' | 'any';
export type BotCaptureValidate =
  | { kind: 'regex'; pattern: string }
  | { kind: 'preset'; preset: BotCaptureValidatePreset };

export interface BotCaptureNode {
  kind: 'CAPTURE';
  /** Prompt enviado al cliente. Soporta interpolación {{var}}. */
  text: string;
  /** Nombre de variable bajo el cual guardar la respuesta en session.data. */
  saveAs: string;
  /** Validación opcional. Sin validate, acepta cualquier texto no vacío. */
  validate?: BotCaptureValidate;
  /** Próximo nodo si valida OK. Puede omitirse si se usa gotoTopic. */
  nextNodeId?: string;
  /** 4.O.1 — alternativo a nextNodeId. Salta al startNodeId del tema. */
  gotoTopic?: string;
  /** Si valida falla y está seteado, salta acá (típicamente un MESSAGE de error). */
  retryNodeId?: string;
  position?: BotNodePosition;
}

// 4.N.2 — MEDIA
export type BotMediaKind = 'image' | 'video' | 'document' | 'audio';

export interface BotMediaNode {
  kind: 'MEDIA';
  mediaType: BotMediaKind;
  /** mediaId devuelto por Meta al subir el archivo (usar /wapi/media/upload). */
  mediaId: string;
  /** Caption opcional (image/video/document). Soporta {{var}}. */
  caption?: string;
  /** Filename para document. */
  filename?: string;
  nextNodeId?: string;
  /** 4.O.1 — alternativo a nextNodeId. Salta al startNodeId del tema. */
  gotoTopic?: string;
  position?: BotNodePosition;
  /**
   * Metadata del binario subido para que el motor pueda persistir las columnas
   * media* del WapiMessage (necesario para que el download endpoint sirva el
   * archivo desde disco). Se llenan al subir desde el editor; opcionales para
   * compatibilidad con flows viejos / mediaIds importados manualmente.
   */
  mediaLocalPath?: string;
  mediaSha256?: string;
  mediaMime?: string;
  mediaSize?: number;
}

// 4.N.2 — CONDITION
export type BotConditionVarOp = 'eq' | 'neq' | 'contains' | 'matches';

export type BotConditionWhen =
  | { kind: 'var'; var: string; op: BotConditionVarOp; value: string }
  /** between: ['HH:MM', 'HH:MM'] — inclusive ambos extremos, en hora local del server. */
  | { kind: 'time'; between: [string, string] }
  /** days: 0=domingo .. 6=sábado. */
  | { kind: 'weekday'; days: number[] };

export interface BotConditionBranch {
  /** ID interno único dentro del nodo CONDITION. */
  id: string;
  when: BotConditionWhen;
  nextNodeId?: string;
  /** 4.O.1 — alternativo a nextNodeId. Salta al startNodeId del tema. */
  gotoTopic?: string;
}

export interface BotConditionNode {
  kind: 'CONDITION';
  branches: BotConditionBranch[];
  /** Fallback si ninguna rama matchea. Si no está, queda esperando (terminal silencioso). */
  elseNextNodeId?: string;
  /** 4.O.1 — alternativo a elseNextNodeId. Salta al startNodeId del tema. */
  elseGotoTopic?: string;
  position?: BotNodePosition;
}

export type BotNode =
  | BotMenuNode
  | BotMessageNode
  | BotHandoffNode
  | BotCaptureNode
  | BotMediaNode
  | BotConditionNode;

export interface BotFlow {
  startNodeId: string;
  nodes: Record<string, BotNode>;
}

// =====================================================================
// 4.O.1 — Multi-tema + router
// =====================================================================
//
// Un BotConfig (ahora WapiConfig.botTopics + botRouter) tiene N temas. Cada
// tema es un BotFlow independiente con su startNodeId/nodes. El router decide
// a qué tema entrar según el inbound (template-payload o keyword exacto). Una
// sesión activa siempre tiene un currentTopicId — el motor resuelve nodos
// como `topics[currentTopicId].flow.nodes[currentNodeId]`.
//
// Inter-topic calls: cualquier nodo con `gotoTopic` en lugar de `nextNodeId`
// hace que el motor cambie `currentTopicId` y arranque desde el `startNodeId`
// del tema destino. Permite componer flows reutilizables (ej. un tema "menú
// principal" llamado desde varios otros temas).

export interface BotTopic {
  id: string;
  label: string;
  flow: BotFlow;
}

/**
 * Reglas del router. Se evalúan en orden (primer match gana). Tipos:
 * - `template-payload`: matchea el `payload` del button/quick-reply de un
 *   template saliente. Permite regex con named groups que se inyectan en
 *   `session.data` como variables iniciales (seedData).
 * - `keyword`: matchea texto inbound case-insensitive contra una lista de
 *   keywords exactos (no parcial, no regex).
 * - `default`: catch-all final, sin condición. Sólo uno tiene sentido.
 */
export type BotRouterRule =
  | {
      kind: 'template-payload';
      /** Patrón regex aplicado al payload. Soporta named groups (?<varName>...). */
      pattern: string;
      topicId: string;
    }
  | {
      kind: 'keyword';
      keywords: string[];
      topicId: string;
    }
  | {
      kind: 'default';
      topicId: string;
    };

export interface BotRouter {
  rules: BotRouterRule[];
  /** Si seteado, equivale a una rule 'default' al final. Atajo para UI. */
  defaultTopicId?: string;
}

export interface BotFlowValidationError {
  path: string;
  message: string;
}

const VALID_KINDS: ReadonlySet<BotNodeKind> = new Set([
  'MENU',
  'MESSAGE',
  'HANDOFF',
  'CAPTURE',
  'MEDIA',
  'CONDITION',
]);

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateNextRef(
  nodesMap: Record<string, unknown>,
  selfId: string,
  ref: unknown,
  path: string,
  errors: BotFlowValidationError[],
  required: boolean,
): void {
  if (ref === undefined || ref === null || ref === '') {
    if (required) errors.push({ path, message: 'requerido' });
    return;
  }
  if (typeof ref !== 'string' || !ref.trim()) {
    errors.push({ path, message: 'debe ser string no vacío' });
    return;
  }
  if (!nodesMap[ref]) {
    errors.push({ path, message: `apunta a node inexistente: ${ref}` });
    return;
  }
  if (ref === selfId) {
    errors.push({ path, message: 'auto-referencia (loop infinito)' });
  }
}

/**
 * 4.O.1 — Valida que el campo gotoTopic, si está presente, sea un string no
 * vacío. La existencia del topicId destino se valida a nivel topics (en
 * `validateBotTopics`), no acá — un flow puede ser válido aislado y referenciar
 * topics que se resuelven en el conjunto.
 */
function validateGotoTopic(
  ref: unknown,
  path: string,
  errors: BotFlowValidationError[],
): boolean {
  if (ref === undefined || ref === null || ref === '') return false;
  if (typeof ref !== 'string' || !ref.trim()) {
    errors.push({ path, message: 'debe ser string no vacío' });
    return false;
  }
  return true;
}

/**
 * Valida la estructura del flow. Garantiza:
 *  - startNodeId existe en nodes.
 *  - Cada MENU tiene 1..3 opciones, todas con label/nextNodeId no vacíos.
 *  - Todo nextNodeId apunta a un node existente.
 *  - Cada nodo tiene los campos requeridos por su kind.
 *  - IDs de opciones únicos dentro del nodo.
 */
export function validateBotFlow(input: unknown): {
  ok: boolean;
  errors: BotFlowValidationError[];
  flow: BotFlow | null;
} {
  const errors: BotFlowValidationError[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'flow debe ser un objeto' }], flow: null };
  }
  const obj = input as Record<string, unknown>;
  const startNodeId = obj.startNodeId;
  const nodes = obj.nodes;
  if (typeof startNodeId !== 'string' || !startNodeId.trim()) {
    errors.push({ path: 'startNodeId', message: 'requerido (string no vacío)' });
  }
  if (!nodes || typeof nodes !== 'object') {
    errors.push({ path: 'nodes', message: 'requerido (objeto)' });
    return { ok: false, errors, flow: null };
  }
  const nodesMap = nodes as Record<string, unknown>;
  const nodeIds = Object.keys(nodesMap);
  if (nodeIds.length === 0) {
    errors.push({ path: 'nodes', message: 'al menos 1 nodo' });
  }
  if (typeof startNodeId === 'string' && !nodesMap[startNodeId]) {
    errors.push({ path: 'startNodeId', message: `no existe en nodes: ${startNodeId}` });
  }
  for (const id of nodeIds) {
    const raw = nodesMap[id];
    if (!raw || typeof raw !== 'object') {
      errors.push({ path: `nodes.${id}`, message: 'debe ser objeto' });
      continue;
    }
    const node = raw as Record<string, unknown>;
    if (typeof node.kind !== 'string' || !VALID_KINDS.has(node.kind as BotNodeKind)) {
      errors.push({
        path: `nodes.${id}.kind`,
        message: 'inválido (esperado MENU|MESSAGE|HANDOFF|CAPTURE|MEDIA|CONDITION)',
      });
      continue;
    }
    // text requerido para todos menos MEDIA y CONDITION
    if (node.kind !== 'MEDIA' && node.kind !== 'CONDITION') {
      if (typeof node.text !== 'string' || !node.text.trim()) {
        errors.push({ path: `nodes.${id}.text`, message: 'requerido' });
      }
    }
    if (node.kind === 'MESSAGE') {
      validateNextRef(nodesMap, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, false);
      validateGotoTopic(node.gotoTopic, `nodes.${id}.gotoTopic`, errors);
    }
    if (node.kind === 'MENU') {
      const opts = Array.isArray(node.options) ? node.options : [];
      if (opts.length < 1) errors.push({ path: `nodes.${id}.options`, message: 'al menos 1 opción' });
      if (opts.length > 3) errors.push({ path: `nodes.${id}.options`, message: 'máximo 3 (límite Meta)' });
      const seen = new Set<string>();
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i] as Record<string, unknown>;
        if (!o || typeof o !== 'object') {
          errors.push({ path: `nodes.${id}.options[${i}]`, message: 'objeto requerido' });
          continue;
        }
        if (typeof o.id !== 'string' || !o.id.trim()) {
          errors.push({ path: `nodes.${id}.options[${i}].id`, message: 'id requerido' });
        } else if (seen.has(o.id)) {
          errors.push({ path: `nodes.${id}.options[${i}].id`, message: `id duplicado: ${o.id}` });
        } else {
          seen.add(o.id);
        }
        if (typeof o.label !== 'string' || !o.label.trim()) {
          errors.push({ path: `nodes.${id}.options[${i}].label`, message: 'label requerido' });
        }
        const hasGoto = validateGotoTopic(
          o.gotoTopic,
          `nodes.${id}.options[${i}].gotoTopic`,
          errors,
        );
        if (typeof o.nextNodeId === 'string' && o.nextNodeId.trim()) {
          if (!nodesMap[o.nextNodeId]) {
            errors.push({
              path: `nodes.${id}.options[${i}].nextNodeId`,
              message: `apunta a node inexistente: ${o.nextNodeId}`,
            });
          }
        } else if (!hasGoto) {
          errors.push({
            path: `nodes.${id}.options[${i}].nextNodeId`,
            message: 'nextNodeId o gotoTopic requerido',
          });
        }
      }
    }
    if (node.kind === 'CAPTURE') {
      if (typeof node.saveAs !== 'string' || !node.saveAs.trim()) {
        errors.push({ path: `nodes.${id}.saveAs`, message: 'requerido' });
      } else if (!VAR_NAME_RE.test(node.saveAs)) {
        errors.push({
          path: `nodes.${id}.saveAs`,
          message: 'debe matchear [a-zA-Z_][a-zA-Z0-9_]*',
        });
      }
      {
        const hasGoto = validateGotoTopic(node.gotoTopic, `nodes.${id}.gotoTopic`, errors);
        validateNextRef(
          nodesMap,
          id,
          node.nextNodeId,
          `nodes.${id}.nextNodeId`,
          errors,
          !hasGoto,
        );
      }
      validateNextRef(nodesMap, id, node.retryNodeId, `nodes.${id}.retryNodeId`, errors, false);
      if (node.validate !== undefined && node.validate !== null) {
        const v = node.validate as Record<string, unknown>;
        if (v.kind === 'regex') {
          if (typeof v.pattern !== 'string' || !v.pattern) {
            errors.push({ path: `nodes.${id}.validate.pattern`, message: 'requerido' });
          } else {
            try {
              new RegExp(v.pattern);
            } catch {
              errors.push({ path: `nodes.${id}.validate.pattern`, message: 'regex inválida' });
            }
          }
        } else if (v.kind === 'preset') {
          if (
            v.preset !== 'email' &&
            v.preset !== 'phone' &&
            v.preset !== 'number' &&
            v.preset !== 'any'
          ) {
            errors.push({
              path: `nodes.${id}.validate.preset`,
              message: 'esperado email|phone|number|any',
            });
          }
        } else {
          errors.push({ path: `nodes.${id}.validate.kind`, message: 'esperado regex|preset' });
        }
      }
    }
    if (node.kind === 'MEDIA') {
      if (
        node.mediaType !== 'image' &&
        node.mediaType !== 'video' &&
        node.mediaType !== 'document' &&
        node.mediaType !== 'audio'
      ) {
        errors.push({
          path: `nodes.${id}.mediaType`,
          message: 'esperado image|video|document|audio',
        });
      }
      if (typeof node.mediaId !== 'string' || !node.mediaId.trim()) {
        errors.push({ path: `nodes.${id}.mediaId`, message: 'requerido' });
      }
      if (node.mediaType === 'audio' && node.caption !== undefined && node.caption !== '') {
        errors.push({ path: `nodes.${id}.caption`, message: 'audio no admite caption' });
      }
      validateNextRef(nodesMap, id, node.nextNodeId, `nodes.${id}.nextNodeId`, errors, false);
      validateGotoTopic(node.gotoTopic, `nodes.${id}.gotoTopic`, errors);
    }
    if (node.kind === 'CONDITION') {
      const branches = Array.isArray(node.branches) ? node.branches : [];
      if (branches.length < 1) {
        errors.push({ path: `nodes.${id}.branches`, message: 'al menos 1 rama' });
      }
      const seen = new Set<string>();
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i] as Record<string, unknown>;
        const bp = `nodes.${id}.branches[${i}]`;
        if (!b || typeof b !== 'object') {
          errors.push({ path: bp, message: 'objeto requerido' });
          continue;
        }
        if (typeof b.id !== 'string' || !b.id.trim()) {
          errors.push({ path: `${bp}.id`, message: 'id requerido' });
        } else if (seen.has(b.id)) {
          errors.push({ path: `${bp}.id`, message: `id duplicado: ${b.id}` });
        } else {
          seen.add(b.id);
        }
        {
          const hasGoto = validateGotoTopic(b.gotoTopic, `${bp}.gotoTopic`, errors);
          validateNextRef(nodesMap, id, b.nextNodeId, `${bp}.nextNodeId`, errors, !hasGoto);
        }
        const w = b.when as Record<string, unknown> | undefined;
        if (!w || typeof w !== 'object') {
          errors.push({ path: `${bp}.when`, message: 'requerido' });
          continue;
        }
        if (w.kind === 'var') {
          if (typeof w.var !== 'string' || !w.var.trim()) {
            errors.push({ path: `${bp}.when.var`, message: 'requerido' });
          } else if (!VAR_NAME_RE.test(w.var)) {
            errors.push({ path: `${bp}.when.var`, message: 'nombre inválido' });
          }
          if (w.op !== 'eq' && w.op !== 'neq' && w.op !== 'contains' && w.op !== 'matches') {
            errors.push({ path: `${bp}.when.op`, message: 'esperado eq|neq|contains|matches' });
          }
          if (typeof w.value !== 'string') {
            errors.push({ path: `${bp}.when.value`, message: 'string requerido' });
          } else if (w.op === 'matches') {
            try {
              new RegExp(w.value);
            } catch {
              errors.push({ path: `${bp}.when.value`, message: 'regex inválida' });
            }
          }
        } else if (w.kind === 'time') {
          const between = Array.isArray(w.between) ? w.between : null;
          if (!between || between.length !== 2) {
            errors.push({ path: `${bp}.when.between`, message: 'esperado [HH:MM, HH:MM]' });
          } else {
            for (let k = 0; k < 2; k++) {
              if (typeof between[k] !== 'string' || !HHMM_RE.test(between[k] as string)) {
                errors.push({
                  path: `${bp}.when.between[${k}]`,
                  message: 'formato HH:MM (00:00..23:59)',
                });
              }
            }
          }
        } else if (w.kind === 'weekday') {
          const days = Array.isArray(w.days) ? w.days : null;
          if (!days || days.length === 0) {
            errors.push({ path: `${bp}.when.days`, message: 'al menos 1 día (0..6)' });
          } else {
            for (let k = 0; k < days.length; k++) {
              const d = days[k];
              if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) {
                errors.push({
                  path: `${bp}.when.days[${k}]`,
                  message: 'entero entre 0 (dom) y 6 (sáb)',
                });
              }
            }
          }
        } else {
          errors.push({ path: `${bp}.when.kind`, message: 'esperado var|time|weekday' });
        }
      }
      validateNextRef(nodesMap, id, node.elseNextNodeId, `nodes.${id}.elseNextNodeId`, errors, false);
      validateGotoTopic(node.elseGotoTopic, `nodes.${id}.elseGotoTopic`, errors);
    }
  }
  if (errors.length > 0) return { ok: false, errors, flow: null };
  return { ok: true, errors: [], flow: input as BotFlow };
}

const TOPIC_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * 4.O.1 — Valida un array de BotTopic. Garantiza:
 *  - Cada topic tiene id (formato `[a-zA-Z0-9_-]+`), label, flow válido.
 *  - IDs únicos.
 *  - Todos los `gotoTopic` y `elseGotoTopic` referenciados dentro de los flows
 *    apuntan a topics existentes en el mismo array.
 *  - Al menos 1 topic.
 */
export function validateBotTopics(input: unknown): {
  ok: boolean;
  errors: BotFlowValidationError[];
  topics: BotTopic[] | null;
} {
  const errors: BotFlowValidationError[] = [];
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ path: '', message: 'topics debe ser array' }], topics: null };
  }
  if (input.length === 0) {
    return { ok: false, errors: [{ path: '', message: 'al menos 1 topic' }], topics: null };
  }
  const seenIds = new Set<string>();
  const validTopics: BotTopic[] = [];
  for (let i = 0; i < input.length; i++) {
    const t = input[i] as Record<string, unknown> | null;
    const tp = `[${i}]`;
    if (!t || typeof t !== 'object') {
      errors.push({ path: tp, message: 'objeto requerido' });
      continue;
    }
    if (typeof t.id !== 'string' || !t.id.trim()) {
      errors.push({ path: `${tp}.id`, message: 'requerido' });
    } else if (!TOPIC_ID_RE.test(t.id)) {
      errors.push({ path: `${tp}.id`, message: 'sólo [a-zA-Z0-9_-]' });
    } else if (seenIds.has(t.id)) {
      errors.push({ path: `${tp}.id`, message: `id duplicado: ${t.id}` });
    } else {
      seenIds.add(t.id);
    }
    if (typeof t.label !== 'string' || !t.label.trim()) {
      errors.push({ path: `${tp}.label`, message: 'requerido' });
    }
    const flowResult = validateBotFlow(t.flow);
    if (!flowResult.ok) {
      for (const e of flowResult.errors) {
        errors.push({ path: `${tp}.flow.${e.path}`, message: e.message });
      }
    } else if (typeof t.id === 'string') {
      validTopics.push({ id: t.id, label: t.label as string, flow: flowResult.flow! });
    }
  }
  // cross-check: gotoTopic refs deben existir
  for (const topic of validTopics) {
    for (const [nodeId, node] of Object.entries(topic.flow.nodes)) {
      const np = `[id=${topic.id}].flow.nodes.${nodeId}`;
      const checkRef = (ref: string | undefined, label: string) => {
        if (ref && !seenIds.has(ref)) {
          errors.push({ path: `${np}.${label}`, message: `topic inexistente: ${ref}` });
        }
      };
      if (node.kind === 'MESSAGE' || node.kind === 'CAPTURE' || node.kind === 'MEDIA') {
        checkRef(node.gotoTopic, 'gotoTopic');
      }
      if (node.kind === 'MENU') {
        node.options.forEach((o, i) => checkRef(o.gotoTopic, `options[${i}].gotoTopic`));
      }
      if (node.kind === 'CONDITION') {
        node.branches.forEach((b, i) => checkRef(b.gotoTopic, `branches[${i}].gotoTopic`));
        checkRef(node.elseGotoTopic, 'elseGotoTopic');
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, topics: null };
  return { ok: true, errors: [], topics: validTopics };
}

/**
 * 4.O.1 — Valida BotRouter. `topicIds` debe pasarse para chequear que las
 * rules referencien topics que existen. Si se llama sin topicIds (validación
 * aislada), sólo se chequea forma estructural.
 */
export function validateBotRouter(
  input: unknown,
  topicIds?: ReadonlySet<string>,
): {
  ok: boolean;
  errors: BotFlowValidationError[];
  router: BotRouter | null;
} {
  const errors: BotFlowValidationError[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'router debe ser objeto' }], router: null };
  }
  const obj = input as Record<string, unknown>;
  const rules = Array.isArray(obj.rules) ? obj.rules : null;
  if (!rules) {
    errors.push({ path: 'rules', message: 'array requerido' });
    return { ok: false, errors, router: null };
  }
  const checkTopic = (id: unknown, path: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      errors.push({ path, message: 'topicId requerido' });
      return;
    }
    if (topicIds && !topicIds.has(id)) {
      errors.push({ path, message: `topic inexistente: ${id}` });
    }
  };
  let defaultsSeen = 0;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i] as Record<string, unknown> | null;
    const rp = `rules[${i}]`;
    if (!r || typeof r !== 'object') {
      errors.push({ path: rp, message: 'objeto requerido' });
      continue;
    }
    if (r.kind === 'template-payload') {
      if (typeof r.pattern !== 'string' || !r.pattern) {
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
      const kws = Array.isArray(r.keywords) ? r.keywords : null;
      if (!kws || kws.length === 0) {
        errors.push({ path: `${rp}.keywords`, message: 'al menos 1 keyword' });
      } else {
        for (let k = 0; k < kws.length; k++) {
          if (typeof kws[k] !== 'string' || !(kws[k] as string).trim()) {
            errors.push({ path: `${rp}.keywords[${k}]`, message: 'string no vacío' });
          }
        }
      }
      checkTopic(r.topicId, `${rp}.topicId`);
    } else if (r.kind === 'default') {
      defaultsSeen++;
      checkTopic(r.topicId, `${rp}.topicId`);
    } else {
      errors.push({ path: `${rp}.kind`, message: 'esperado template-payload|keyword|default' });
    }
  }
  if (defaultsSeen > 1) {
    errors.push({ path: 'rules', message: 'múltiples reglas default — usar una sola o defaultTopicId' });
  }
  if (obj.defaultTopicId !== undefined && obj.defaultTopicId !== null) {
    checkTopic(obj.defaultTopicId, 'defaultTopicId');
  }
  if (errors.length > 0) return { ok: false, errors, router: null };
  return {
    ok: true,
    errors: [],
    router: {
      rules: rules as BotRouterRule[],
      defaultTopicId: typeof obj.defaultTopicId === 'string' ? obj.defaultTopicId : undefined,
    },
  };
}

// =====================================================================
// 4.O.4 — Variables declarativas
// =====================================================================
//
// Hasta 4.O.3 las variables eran implícitas: salían de CAPTURE.saveAs y de
// named groups del router (template-payload). El editor obligaba a tipear
// `{{var}}` a mano. 4.O.4 introduce un panel donde se declaran de antemano —
// el editor las ofrece como picker en TextFields y Select en CAPTURE.saveAs /
// CONDITION.var.var. La declaración se persiste en `botVariables` (publicado)
// y `botVariablesDraft` (borrador), paralelo a topics/router.
//
// El motor las usa para sembrar `session.data` con `defaultValue` antes del
// overlay con seedData del router. No afectan el shape de los nodos: una
// variable no declarada referenciada en `{{x}}` se sigue tratando como '' al
// interpolar (warning en validación, no error).

export type BotVariableType = 'string' | 'number' | 'boolean';

export interface BotVariable {
  /** Identificador en `{{name}}` y session.data — [a-zA-Z_][a-zA-Z0-9_]*. */
  name: string;
  type: BotVariableType;
  /** Texto opcional para que el editor muestre tooltip / ayuda. */
  description?: string;
  /**
   * Valor inicial al arrancar una sesión. Si no está, la variable queda
   * undefined hasta que un CAPTURE/seedData la complete. El tipo del valor
   * debe ser compatible con `type`.
   */
  defaultValue?: string | number | boolean;
}

const VAR_DECL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * 4.O.4 — Valida un array de BotVariable. Garantiza:
 *  - Cada variable tiene name válido y type ∈ {string,number,boolean}.
 *  - Names únicos.
 *  - defaultValue (si está) coincide con el type declarado.
 */
export function validateBotVariables(input: unknown): {
  ok: boolean;
  errors: BotFlowValidationError[];
  variables: BotVariable[] | null;
} {
  const errors: BotFlowValidationError[] = [];
  if (input === null || input === undefined) {
    return { ok: true, errors: [], variables: [] };
  }
  if (!Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'variables debe ser array' }],
      variables: null,
    };
  }
  const seen = new Set<string>();
  const out: BotVariable[] = [];
  for (let i = 0; i < input.length; i++) {
    const v = input[i] as Record<string, unknown> | null;
    const vp = `[${i}]`;
    if (!v || typeof v !== 'object') {
      errors.push({ path: vp, message: 'objeto requerido' });
      continue;
    }
    if (typeof v.name !== 'string' || !v.name.trim()) {
      errors.push({ path: `${vp}.name`, message: 'requerido' });
      continue;
    }
    if (!VAR_DECL_NAME_RE.test(v.name)) {
      errors.push({
        path: `${vp}.name`,
        message: 'debe matchear [a-zA-Z_][a-zA-Z0-9_]*',
      });
      continue;
    }
    if (seen.has(v.name)) {
      errors.push({ path: `${vp}.name`, message: `duplicado: ${v.name}` });
      continue;
    }
    seen.add(v.name);
    if (v.type !== 'string' && v.type !== 'number' && v.type !== 'boolean') {
      errors.push({ path: `${vp}.type`, message: 'esperado string|number|boolean' });
      continue;
    }
    if (v.description !== undefined && v.description !== null) {
      if (typeof v.description !== 'string') {
        errors.push({ path: `${vp}.description`, message: 'string requerido' });
        continue;
      }
    }
    let defaultValue: BotVariable['defaultValue'];
    if (v.defaultValue !== undefined && v.defaultValue !== null) {
      const t = typeof v.defaultValue;
      if (t !== v.type) {
        errors.push({
          path: `${vp}.defaultValue`,
          message: `tipo no coincide con ${v.type}`,
        });
        continue;
      }
      defaultValue = v.defaultValue as BotVariable['defaultValue'];
    }
    out.push({
      name: v.name,
      type: v.type,
      ...(typeof v.description === 'string' && v.description.length > 0
        ? { description: v.description }
        : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    });
  }
  if (errors.length > 0) return { ok: false, errors, variables: null };
  return { ok: true, errors: [], variables: out };
}

/**
 * 4.O.4 — Auto-importa variables implícitas (CAPTURE.saveAs, named groups del
 * router) en la lista declarada. Útil para flows pre-existentes que no tenían
 * panel de variables y al primer save de draft no perderlas. Devuelve un
 * superset: las ya declaradas tienen prioridad (no se pisan).
 */
export function inferImplicitVariables(
  topics: BotTopic[] | null,
  router: BotRouter | null,
  declared: BotVariable[] | null,
): BotVariable[] {
  const map = new Map<string, BotVariable>();
  for (const v of declared ?? []) map.set(v.name, v);

  const addString = (name: string) => {
    if (!VAR_DECL_NAME_RE.test(name)) return;
    if (!map.has(name)) {
      map.set(name, { name, type: 'string' });
    }
  };

  for (const t of topics ?? []) {
    for (const node of Object.values(t.flow.nodes)) {
      if (node.kind === 'CAPTURE' && typeof node.saveAs === 'string') {
        addString(node.saveAs);
      }
      if (node.kind === 'CONDITION') {
        for (const b of node.branches) {
          if (b.when.kind === 'var') addString(b.when.var);
        }
      }
    }
  }
  for (const r of router?.rules ?? []) {
    if (r.kind === 'template-payload') {
      // Extrae named groups del pattern `(?<name>...)`.
      const re = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(r.pattern)) !== null) {
        addString(m[1] as string);
      }
    }
  }
  return Array.from(map.values());
}
