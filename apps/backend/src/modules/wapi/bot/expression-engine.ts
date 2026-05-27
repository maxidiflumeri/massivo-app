/**
 * 4.P.1 — Motor de expresiones JSONata para el bot designer.
 *
 * Sintaxis opt-in: `{{= expr }}` dispara el evaluator. `{{var}}` plano sigue
 * funcionando en `interpolate.ts` para no romper flows guardados.
 *
 * JSONata 2.x es declarativa, sandbox (no eval, no acceso a globals) y trae
 * ~100 funciones built-in (paths, arrays, strings, fechas, agregaciones). Ver
 * https://jsonata.org. La compilación es síncrona (parse); sólo la evaluación
 * es async, por eso esta API es async.
 *
 * Cache de Expressions compiladas para evitar reparsear en cada inbound. Cap
 * fijo: cuando se llena, se vacía entera (LRU sería ideal pero esta carga es
 * suficiente para volúmenes esperados).
 */
import jsonata, { type Expression } from 'jsonata';

const EXPR_TOKEN_RE = /\{\{=\s*([\s\S]+?)\s*\}\}/g;
const MAX_CACHE = 500;
const cache = new Map<string, Expression>();

/** Compila una expresión JSONata (cacheada). Tira `SyntaxError` si la expr es inválida. */
export function compile(expr: string): Expression {
  const cached = cache.get(expr);
  if (cached) return cached;
  const compiled = jsonata(expr);
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(expr, compiled);
  return compiled;
}

/** Devuelve true si el template contiene al menos un token `{{= expr }}`. */
export function hasExpressionTokens(template: string): boolean {
  if (!template || !template.includes('{{=')) return false;
  EXPR_TOKEN_RE.lastIndex = 0;
  return EXPR_TOKEN_RE.test(template);
}

/**
 * Evalúa una expresión y devuelve el valor crudo. Para CONDITION/SET_VAR/FOREACH.items
 * donde el caller necesita el tipo real (boolean, array, etc.), no su representación
 * en string.
 */
export async function evaluateExpression(
  expr: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const compiled = compile(expr);
  return await compiled.evaluate(data ?? {});
}

/**
 * Reemplaza cada token `{{= expr }}` en `template` por la representación string de
 * su resultado. Tokens `{{var}}` planos quedan intactos (los procesa `interpolate.ts`
 * con sintaxis distinta para no colisionar).
 *
 * Comportamiento alineado con `interpolate()`:
 * - `undefined`/`null` → `''`.
 * - Strings se devuelven tal cual.
 * - Objetos/arrays se serializan con `JSON.stringify`.
 * - Otros tipos se castean con `String()`.
 * - Si la expresión falla en runtime, se devuelve `''` (no rompe el texto).
 *
 * Las evaluaciones de cada token corren en paralelo (`Promise.all`) porque son
 * independientes contra el mismo `data`.
 */
export async function interpolateExpressionTokens(
  template: string,
  data: Record<string, unknown> | null | undefined,
): Promise<string> {
  if (!template) return template;
  if (!template.includes('{{=')) return template;
  const safeData = data ?? {};
  const tokens: { expr: string }[] = [];
  template.replace(EXPR_TOKEN_RE, (_full, expr: string) => {
    tokens.push({ expr });
    return '';
  });
  if (tokens.length === 0) return template;
  const resolved = await Promise.all(
    tokens.map(async (t) => {
      try {
        const v = await evaluateExpression(t.expr, safeData);
        return stringifyValue(v);
      } catch {
        return '';
      }
    }),
  );
  let i = 0;
  return template.replace(EXPR_TOKEN_RE, () => resolved[i++] ?? '');
}

function stringifyValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Útil para tests para forzar limpieza del cache entre casos. No usar en runtime. */
export function _resetCacheForTests(): void {
  cache.clear();
}
