/**
 * Tipos del bot guiado por número (4.N). El flow se persiste como JSON en
 * `WapiConfig.botFlow`. Tres tipos de nodos:
 *  - **MENU**: muestra un mensaje + hasta 3 opciones (botones interactive).
 *    Cada opción tiene un `nextNodeId` que define a dónde ir cuando el cliente
 *    la elige.
 *  - **MESSAGE**: envía un texto plano (sin botones). Si tiene `nextNodeId`,
 *    el motor avanza automáticamente al siguiente nodo (puede encadenar varios
 *    MESSAGE antes de llegar a un MENU o HANDOFF). Si no tiene `nextNodeId`,
 *    es terminal silencioso (la sesión queda abierta hasta TTL).
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
 */

export const BOT_OPTION_PREFIX = 'bot:';

/**
 * Profundidad máxima de encadenamiento automático (MESSAGE → MESSAGE → ...).
 * Sirve para cortar loops accidentales si el editor permite ciclos.
 */
export const BOT_MAX_AUTO_CHAIN = 8;

export type BotNodeKind = 'MENU' | 'MESSAGE' | 'HANDOFF';

export interface BotNodePosition {
  x: number;
  y: number;
}

export interface BotMenuOption {
  /** ID interno único dentro del nodo. El motor lo prefija con `bot:` al armar el button id. */
  id: string;
  label: string;
  nextNodeId: string;
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
  position?: BotNodePosition;
}

export interface BotHandoffNode {
  kind: 'HANDOFF';
  text: string;
  /** Si true, marca la conversación como priority al cerrar la sesión. */
  escalate?: boolean;
  position?: BotNodePosition;
}

export type BotNode = BotMenuNode | BotMessageNode | BotHandoffNode;

export interface BotFlow {
  startNodeId: string;
  nodes: Record<string, BotNode>;
}

export interface BotFlowValidationError {
  path: string;
  message: string;
}

/**
 * Valida la estructura del flow. Garantiza:
 *  - startNodeId existe en nodes.
 *  - Cada MENU tiene 1..3 opciones, todas con label/nextNodeId no vacíos.
 *  - Todo nextNodeId apunta a un node existente.
 *  - Cada nodo tiene text no vacío.
 *  - IDs de opciones únicos dentro del nodo.
 *  - Existe al menos un nodo HANDOFF alcanzable (warning, no error fatal).
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
    if (node.kind !== 'MENU' && node.kind !== 'MESSAGE' && node.kind !== 'HANDOFF') {
      errors.push({ path: `nodes.${id}.kind`, message: `inválido (esperado MENU|MESSAGE|HANDOFF)` });
      continue;
    }
    if (typeof node.text !== 'string' || !node.text.trim()) {
      errors.push({ path: `nodes.${id}.text`, message: 'requerido' });
    }
    if (node.kind === 'MESSAGE') {
      if (node.nextNodeId !== undefined && node.nextNodeId !== null) {
        if (typeof node.nextNodeId !== 'string' || !node.nextNodeId.trim()) {
          errors.push({ path: `nodes.${id}.nextNodeId`, message: 'debe ser string no vacío o ausente' });
        } else if (!nodesMap[node.nextNodeId]) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: `apunta a node inexistente: ${node.nextNodeId}`,
          });
        } else if (node.nextNodeId === id) {
          errors.push({
            path: `nodes.${id}.nextNodeId`,
            message: 'auto-referencia (loop infinito)',
          });
        }
      }
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
        if (typeof o.nextNodeId !== 'string' || !o.nextNodeId.trim()) {
          errors.push({ path: `nodes.${id}.options[${i}].nextNodeId`, message: 'nextNodeId requerido' });
        } else if (!nodesMap[o.nextNodeId]) {
          errors.push({
            path: `nodes.${id}.options[${i}].nextNodeId`,
            message: `apunta a node inexistente: ${o.nextNodeId}`,
          });
        }
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, flow: null };
  return { ok: true, errors: [], flow: input as BotFlow };
}
