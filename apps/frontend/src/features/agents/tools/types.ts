/**
 * Tools personalizadas de agentes (la sección "Herramientas"). Una tool tiene
 * dos caras: la **definición** que ve el LLM (name/description/parameters) y la
 * **acción HTTP** que ejecuta el backend. El builder de parámetros de la UI
 * traduce filas amigables ↔ JSON Schema (lo que el modelo realmente recibe).
 */

export const AGENT_TOOL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type AgentToolMethod = (typeof AGENT_TOOL_METHODS)[number];

/** Métodos que llevan body. */
export const METHODS_WITH_BODY: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);

/** Slug que ve el LLM: snake_case, empieza con letra. Igual al regex del backend. */
export const AGENT_TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** Con qué enmascara el backend los values secret en las respuestas del CRUD. */
export const SECRET_MASK = '••••';

export interface AgentToolHeader {
  key: string;
  /** Si `secret`, llega enmascarado (`••••`) en los GET. */
  value: string;
  secret: boolean;
}

/** Lo que devuelve `GET /api/agent-tools`. */
export interface AgentTool {
  id: string;
  type: string;
  name: string;
  displayName: string;
  description: string;
  parameters: JsonSchemaObject;
  method: string;
  url: string;
  headers: AgentToolHeader[];
  bodyTemplate: unknown;
  timeoutMs: number | null;
  enabled: boolean;
  /** Agentes que la usan (para la columna "usada por"). */
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolPayload {
  name: string;
  displayName: string;
  description: string;
  parameters: JsonSchemaObject;
  method: string;
  url: string;
  headers?: AgentToolHeader[];
  bodyTemplate?: unknown;
  timeoutMs?: number | null;
  enabled?: boolean;
}

// --- JSON Schema (subset que maneja el builder) -----------------------------

export type ParamType = 'string' | 'number' | 'integer' | 'boolean';

export const PARAM_TYPES: ParamType[] = ['string', 'number', 'integer', 'boolean'];

/** Fila del builder de parámetros (lo que edita el usuario). */
export interface ParamRow {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}

interface JsonSchemaProp {
  type?: string;
  description?: string;
}

export interface JsonSchemaObject {
  type: 'object';
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
  [k: string]: unknown;
}

/** JSON Schema → filas del builder. */
export function schemaToRows(schema: JsonSchemaObject | undefined): ParamRow[] {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: (PARAM_TYPES.includes(def.type as ParamType) ? def.type : 'string') as ParamType,
    description: def.description ?? '',
    required: required.has(name),
  }));
}

/** Filas del builder → JSON Schema (lo que ve el LLM). */
export function rowsToSchema(rows: ParamRow[]): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProp> = {};
  const required: string[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const prop: JsonSchemaProp = { type: r.type };
    if (r.description.trim()) prop.description = r.description.trim();
    properties[name] = prop;
    if (r.required) required.push(name);
  }
  const schema: JsonSchemaObject = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
}
