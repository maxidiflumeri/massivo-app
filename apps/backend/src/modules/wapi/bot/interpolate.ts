/**
 * Interpolación de textos del bot guiado. Dos sintaxis conviven:
 *
 *  - `{{nombreVariable}}` (4.N.2) — sustitución plana de `vars[name]`. Sin paths,
 *    sin lógica, sin funciones. Es la sintaxis original y sigue funcionando para
 *    todos los flows guardados sin cambios.
 *  - `{{= expr }}` (4.P.1) — evalúa una expresión JSONata sobre `vars` y la inserta
 *    como string. Soporta paths anidados, agregaciones, fechas, etc. Requiere usar
 *    `interpolateAsync` (la versión sync `interpolate` ignora estos tokens).
 *
 * Comportamiento de `{{var}}` plano:
 *  - Variables ausentes / null / undefined → string vacío.
 *  - Valores no string se castean con String().
 *  - Espacios alrededor del nombre se ignoran.
 *  - Solo matchea `[a-zA-Z_][a-zA-Z0-9_]*` — patrones inválidos quedan tal cual.
 */
import { interpolateExpressionTokens } from './expression-engine';

const VAR_TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function interpolate(template: string, vars: Record<string, unknown> | null | undefined): string {
  if (!template) return template;
  if (!vars) return template.replace(VAR_TOKEN_RE, '');
  return template.replace(VAR_TOKEN_RE, (_, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    return String(v);
  });
}

/**
 * 4.P.1 — Variante async que primero resuelve `{{= expr }}` con el motor JSONata
 * y después aplica el `{{var}}` plano. El orden importa: si una expresión devuelve
 * un string que contiene `{{otra}}`, ese resultado se respeta literal (no se
 * re-interpola), porque se inserta DESPUÉS del paso de expresiones.
 *
 * Si el template no contiene `{{=`, devuelve directamente `interpolate(...)` sin
 * promise overhead — la mayoría de los flows existentes pasan por acá sin costo.
 */
export async function interpolateAsync(
  template: string,
  vars: Record<string, unknown> | null | undefined,
): Promise<string> {
  if (!template) return template;
  if (!template.includes('{{=')) return interpolate(template, vars);
  const afterExpr = await interpolateExpressionTokens(template, vars);
  return interpolate(afterExpr, vars);
}
