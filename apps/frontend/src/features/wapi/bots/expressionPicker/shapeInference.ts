/**
 * 4.P — Inferencia de shape para el ExpressionPicker.
 *
 * Walks un valor JSON arbitrario (típicamente `mockResponse.body` o el snapshot
 * del último step del sandbox) y produce un árbol con tipos inferidos + paths
 * navegables. Diseñado puro / sin React para tests aislados.
 *
 * Ejemplo:
 *   inferShape({ name: "Juan", pedidos: [{ id: 1 }] })
 *   →
 *   {
 *     type: 'object',
 *     children: [
 *       { key: 'name',    path: 'name',    type: 'string', sample: 'Juan' },
 *       { key: 'pedidos', path: 'pedidos', type: 'array',  sample: [...],
 *         itemShape: { type: 'object', children: [{key:'id', path:'pedidos[0].id', ...}] } }
 *     ]
 *   }
 *
 * El `path` de cada nodo es **relativo al root del valor inspeccionado**. El
 * caller prefijará el nombre de la variable (ej `usuario.body.<path>`).
 *
 * Cap de profundidad para evitar JSONs patológicos.
 */

export type ShapeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array'
  | 'unknown';

export interface ShapeNode {
  /** Tipo inferido. */
  type: ShapeType;
  /** Valor de muestra (truncado si es muy grande). undefined si no se quiere mostrar. */
  sample?: unknown;
  /**
   * Hijos directos del objeto. Vacío si type !== 'object'. Cada entry tiene el
   * key + el path absoluto desde el root del valor inspeccionado.
   */
  children?: Array<{ key: string; path: string; node: ShapeNode }>;
  /**
   * Si type === 'array', shape del primer item (si lo hay). Permite navegar
   * dentro de `arr[0]` recursivamente.
   */
  itemShape?: ShapeNode;
  /** Longitud del array (solo si type === 'array'). */
  length?: number;
}

const MAX_DEPTH = 6;
const MAX_CHILDREN_PER_OBJECT = 64;
const SAMPLE_STRING_MAX_LEN = 60;

/** Punto de entrada. */
export function inferShape(value: unknown, depth = 0, basePath = ''): ShapeNode {
  if (value === null) return { type: 'null', sample: null };
  if (value === undefined) return { type: 'unknown' };
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return {
      type: 'string',
      sample: s.length > SAMPLE_STRING_MAX_LEN ? s.slice(0, SAMPLE_STRING_MAX_LEN) + '…' : s,
    };
  }
  if (t === 'number') return { type: 'number', sample: value };
  if (t === 'boolean') return { type: 'boolean', sample: value };
  if (Array.isArray(value)) {
    const arr = value;
    const node: ShapeNode = { type: 'array', length: arr.length };
    if (arr.length > 0 && depth < MAX_DEPTH) {
      // Inferir shape del primer item. El path del item es `${basePath}[0]`.
      const firstPath = basePath === '' ? '[0]' : `${basePath}[0]`;
      node.itemShape = inferShape(arr[0], depth + 1, firstPath);
    }
    return node;
  }
  if (t === 'object') {
    if (depth >= MAX_DEPTH) return { type: 'object' };
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, MAX_CHILDREN_PER_OBJECT);
    const children = keys.map((k) => {
      const childPath = basePath === '' ? safePathSegment(k) : `${basePath}.${safePathSegment(k)}`;
      return { key: k, path: childPath, node: inferShape(obj[k], depth + 1, childPath) };
    });
    return { type: 'object', children };
  }
  return { type: 'unknown' };
}

/**
 * Las claves de objetos JSON pueden contener caracteres que no son válidos como
 * identificadores JSONata (espacios, guiones, números al principio, etc). En esos
 * casos hay que usar `["nombre con espacios"]` en vez de `.nombre`. Detectamos
 * eso y emitimos el segmento adecuado.
 */
function safePathSegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  // Escapamos comillas dobles internas y comillas invertidas reservadas.
  const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `\`${escaped}\``; // JSONata acepta `` `nombre con espacios` `` como key referenciada
}

/**
 * Construye un path JSONata desde el root completo (típicamente el nombre de
 * variable + `.body` + path interno) hacia el leaf seleccionado.
 *
 * Ejemplos:
 *   buildJsonataPath('usuario', 'body.name')   → 'usuario.body.name'
 *   buildJsonataPath('usuario', 'body[0].id')  → 'usuario.body[0].id'
 *   buildJsonataPath('item', '')               → 'item'
 *   buildJsonataPath('foo', '`bar baz`.x')     → 'foo.`bar baz`.x'
 */
export function buildJsonataPath(rootName: string, relativePath: string): string {
  if (!relativePath) return rootName;
  // Si el segundo empieza con `[` (array index), no agregamos `.`.
  if (relativePath.startsWith('[')) return `${rootName}${relativePath}`;
  return `${rootName}.${relativePath}`;
}
