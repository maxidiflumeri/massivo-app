/**
 * Interpolación {{var}} para textos del bot guiado (4.N.2). Sintaxis tipo
 * mustache muy reducida: solo `{{nombreVariable}}`. No soporta lógica,
 * loops, helpers ni paths anidados.
 *
 * - Variables ausentes / null / undefined → string vacío (no rompe el texto).
 * - Valores no string se castean con String().
 * - Espacios alrededor del nombre se ignoran: `{{ nombre }}` ≡ `{{nombre}}`.
 * - Solo matchea nombres válidos `[a-zA-Z_][a-zA-Z0-9_]*`. Cualquier otro
 *   patrón con dobles llaves se deja tal cual (defensa contra falsos positivos).
 */

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
