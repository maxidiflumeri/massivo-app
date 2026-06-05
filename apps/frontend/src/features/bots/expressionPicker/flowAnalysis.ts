/**
 * 4.P — Análisis estático del flow para listar qué variables están disponibles
 * cuando se edita un nodo dado. Lo usa el ExpressionPicker para poblar el árbol.
 *
 * MVP: enumera TODOS los HTTPs y FOREACHs del topic activo (excluyendo el
 * nodo que se está editando), no hace reachability precisa. Justificación:
 *   - El usuario las "puede" usar si esos nodos están en algún camino que llega
 *     al nodo actual.
 *   - Hacer reachability DAG perfecto suma complejidad alta para poco beneficio:
 *     un HTTP en otra rama que no ejecutó devolvería `undefined` en runtime y la
 *     interpolación caería a string vacío (no rompe nada).
 *
 * Variables incluidas:
 *  - Variables declaradas (`botVariables`).
 *  - HTTPs del topic con su `saveAs` + `mockResponse.body` (inferido).
 *  - FOREACHs del topic con `itemVar` (y opcional `indexVar`).
 *  - Variables de CAPTURE (`saveAs`) — el motor las guarda como strings sin shape.
 *  - Variables de SET_VAR (`varName`) — primitive, sin shape.
 *
 * Salida: un array de "scopes" para que el picker los renderice agrupados.
 */
import type { BotFlow, BotNode, BotVariable } from '../types';

export type ScopeKind = 'declared' | 'http' | 'foreach' | 'capture' | 'setvar';

export interface ScopeEntry {
  kind: ScopeKind;
  /** Nombre raíz de la variable (lo que se escribe entre `{{= ` y `.`). */
  name: string;
  /** Etiqueta human-readable para el header del grupo (ej "saveAs en HTTP node_1"). */
  label: string;
  /**
   * Tipo declarado si aplica (variables declaradas, SET_VAR coercionado al tipo
   * declarado, etc). Para HTTP y FOREACH no aplica directamente — su shape se
   * deriva de mockResponse/itemShape.
   */
  declaredType?: 'string' | 'number' | 'boolean';
  /** Para HTTP: el `mockResponse.body` crudo para inferir shape. undefined si no hay mock. */
  mockBody?: unknown;
  /** Para HTTP: indica que la response real shape se podría inferir si hubiera mock. */
  hasMock?: boolean;
  /** Para FOREACH: nombre del indexVar (si está definido) — se renderiza como entrada aparte. */
  indexVar?: string;
  /** Nodo origen (id) por si el caller quiere mostrar el nodo en el árbol. */
  sourceNodeId?: string;
}

export interface AnalyzedScope {
  /** Variables declaradas top-level. */
  declared: ScopeEntry[];
  /** HTTPs del topic — fuente principal de paths anidados ricos. */
  https: ScopeEntry[];
  /** Loops del topic — itemVar/indexVar disponibles cuando estás dentro del body. */
  foreaches: ScopeEntry[];
  /** CAPTURE.saveAs — strings sin shape. */
  captures: ScopeEntry[];
  /** SET_VAR.varName — primitives con tipo declarado opcional. */
  setvars: ScopeEntry[];
}

/**
 * Analiza el flow y devuelve los scopes disponibles para `currentNodeId`. Si
 * `currentNodeId` está en el flow, se excluye de los resultados (el nodo no se
 * referencia a sí mismo). `variables` son las declaraciones top-level.
 */
export function analyzeScope(
  flow: BotFlow,
  currentNodeId: string | null,
  variables: BotVariable[],
): AnalyzedScope {
  const declared: ScopeEntry[] = variables.map((v) => ({
    kind: 'declared',
    name: v.name,
    label: v.description ? `${v.name} — ${v.description}` : v.name,
    declaredType: v.type,
  }));

  const https: ScopeEntry[] = [];
  const foreaches: ScopeEntry[] = [];
  const captures: ScopeEntry[] = [];
  const setvars: ScopeEntry[] = [];

  for (const [id, node] of Object.entries(flow.nodes)) {
    if (id === currentNodeId) continue;
    if (node.kind === 'HTTP') {
      if (!node.saveAs) continue;
      https.push({
        kind: 'http',
        name: node.saveAs,
        label: `${node.saveAs} (HTTP "${id}")`,
        mockBody: node.mockResponse?.body,
        hasMock: !!node.mockResponse,
        sourceNodeId: id,
      });
    } else if (node.kind === 'FOREACH') {
      if (!node.itemVar) continue;
      foreaches.push({
        kind: 'foreach',
        name: node.itemVar,
        label: `${node.itemVar} (FOREACH "${id}")`,
        indexVar: node.indexVar,
        sourceNodeId: id,
      });
    } else if (node.kind === 'CAPTURE') {
      if (!node.saveAs) continue;
      captures.push({
        kind: 'capture',
        name: node.saveAs,
        label: `${node.saveAs} (CAPTURE "${id}")`,
        sourceNodeId: id,
      });
    } else if (node.kind === 'SET_VAR') {
      if (!node.varName) continue;
      // Si la variable también está declarada, no la duplicamos.
      const alreadyDeclared = variables.find((v) => v.name === node.varName);
      if (alreadyDeclared) continue;
      setvars.push({
        kind: 'setvar',
        name: node.varName,
        label: `${node.varName} (SET_VAR "${id}")`,
        sourceNodeId: id,
      });
    }
  }

  // Deduplicar por nombre dentro de cada grupo (puede haber varios HTTPs con
  // mismo saveAs si el usuario reusa nombres — quedaría sólo el primero).
  const dedup = (arr: ScopeEntry[]) => {
    const seen = new Set<string>();
    const out: ScopeEntry[] = [];
    for (const e of arr) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push(e);
    }
    return out;
  };

  return {
    declared,
    https: dedup(https),
    foreaches: dedup(foreaches),
    captures: dedup(captures),
    setvars: dedup(setvars),
  };
}
