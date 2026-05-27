/**
 * 4.P — Mini-parser del contenido de una expresión JSONata para syntax highlight
 * sub-nivel dentro de los tokens `{{= ... }}`.
 *
 * NO es un parser completo de JSONata; sólo extrae los chunks visibles más útiles
 * para colorear:
 *  - `fn`    → `$nombreFn` (funciones JSONata; empiezan con `$`).
 *  - `var`   → identificadores y paths (`usuario.body.name`, `item`, etc).
 *  - `str`   → strings literales con comillas dobles o simples.
 *  - `num`   → números enteros y decimales.
 *  - `punct` → todo el resto (operadores, paréntesis, comas, espacios, etc).
 *
 * Edge cases:
 *  - `$$` (binding del valor actual JSONata) → `fn`.
 *  - `$v` adentro de `function($v) { ... }` → también `fn` (es una variable
 *    JSONata pero comparte sintaxis con funciones por el `$` prefix).
 *  - Strings con escape `\"` se respetan: el cierre debe ser una `"` no escapada.
 *  - Paths con backticks `` `key con espacios` `` se tratan como un solo `var`.
 *
 * Es single-pass sin backtracking → O(n).
 */

export type ExprSubTokenType = 'fn' | 'var' | 'str' | 'num' | 'punct';

export interface ExprSubToken {
  type: ExprSubTokenType;
  raw: string;
}

const IDENT_START_RE = /[a-zA-Z_]/;
const IDENT_CONT_RE = /[a-zA-Z0-9_]/;
const DIGIT_RE = /[0-9]/;

export function tokenizeExpression(inner: string): ExprSubToken[] {
  const tokens: ExprSubToken[] = [];
  let i = 0;
  let punctStart = 0;

  const flushPunct = (until: number) => {
    if (until > punctStart) {
      tokens.push({ type: 'punct', raw: inner.slice(punctStart, until) });
    }
  };

  while (i < inner.length) {
    const ch = inner[i]!;

    // Función JSONata: `$name` o `$$` o `$v` (variable de lambda).
    if (ch === '$') {
      flushPunct(i);
      let j = i + 1;
      if (inner[j] === '$') {
        // `$$` exacto.
        tokens.push({ type: 'fn', raw: inner.slice(i, j + 1) });
        i = j + 1;
        punctStart = i;
        continue;
      }
      while (j < inner.length && IDENT_CONT_RE.test(inner[j]!)) j += 1;
      tokens.push({ type: 'fn', raw: inner.slice(i, j) });
      i = j;
      punctStart = i;
      continue;
    }

    // String literal con comillas dobles.
    if (ch === '"' || ch === "'") {
      flushPunct(i);
      const quote = ch;
      let j = i + 1;
      while (j < inner.length) {
        if (inner[j] === '\\' && j + 1 < inner.length) {
          j += 2;
          continue;
        }
        if (inner[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ type: 'str', raw: inner.slice(i, j) });
      i = j;
      punctStart = i;
      continue;
    }

    // Path entre backticks: `\`key con espacios\``.
    if (ch === '`') {
      flushPunct(i);
      let j = i + 1;
      while (j < inner.length) {
        if (inner[j] === '\\' && j + 1 < inner.length) {
          j += 2;
          continue;
        }
        if (inner[j] === '`') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ type: 'var', raw: inner.slice(i, j) });
      i = j;
      punctStart = i;
      continue;
    }

    // Número entero o decimal.
    if (DIGIT_RE.test(ch)) {
      flushPunct(i);
      let j = i + 1;
      while (j < inner.length && DIGIT_RE.test(inner[j]!)) j += 1;
      if (inner[j] === '.' && j + 1 < inner.length && DIGIT_RE.test(inner[j + 1]!)) {
        j += 1;
        while (j < inner.length && DIGIT_RE.test(inner[j]!)) j += 1;
      }
      tokens.push({ type: 'num', raw: inner.slice(i, j) });
      i = j;
      punctStart = i;
      continue;
    }

    // Identificador / path: nombre + opcional `.name` o `[N]` encadenado.
    if (IDENT_START_RE.test(ch)) {
      flushPunct(i);
      let j = i + 1;
      while (j < inner.length && IDENT_CONT_RE.test(inner[j]!)) j += 1;
      // Continuar con segmentos `.name`, `[N]`, `` .`name con espacios` ``.
      while (j < inner.length) {
        const c = inner[j]!;
        if (c === '.' && j + 1 < inner.length) {
          const next = inner[j + 1]!;
          if (IDENT_START_RE.test(next)) {
            j += 1;
            while (j < inner.length && IDENT_CONT_RE.test(inner[j]!)) j += 1;
            continue;
          }
          if (next === '`') {
            // .`key con espacios`
            j += 2;
            while (j < inner.length) {
              if (inner[j] === '\\' && j + 1 < inner.length) {
                j += 2;
                continue;
              }
              if (inner[j] === '`') {
                j += 1;
                break;
              }
              j += 1;
            }
            continue;
          }
          break;
        }
        if (c === '[') {
          // Subscript `[0]`. Sólo continuamos el var-token si es un literal
          // numérico simple. Si tiene una expresión adentro (`[active=true]`),
          // cortamos para no comernos operadores.
          const close = inner.indexOf(']', j);
          if (close === -1) break;
          const inside = inner.slice(j + 1, close);
          if (/^\s*\d+\s*$/.test(inside)) {
            j = close + 1;
            continue;
          }
          break;
        }
        break;
      }
      tokens.push({ type: 'var', raw: inner.slice(i, j) });
      i = j;
      punctStart = i;
      continue;
    }

    // Cualquier otro caracter → acumular como punct.
    i += 1;
  }

  flushPunct(inner.length);
  return tokens;
}

/**
 * Helper para extraer prefix/inner/suffix de un token `expr` o `var` cerrado.
 * Ej: `{{= $count(items) }}` → { prefix: '{{= ', inner: '$count(items)', suffix: ' }}' }.
 * Si el raw no matchea (no debería pasar para tokens válidos), devuelve null.
 */
export function splitTokenRaw(
  raw: string,
  type: 'expr' | 'var',
): { prefix: string; inner: string; suffix: string } | null {
  // Para expr: `{{= ... }}`.  Para var: `{{ ... }}` (sin `=`).
  const re = type === 'expr' ? /^(\{\{=\s*)([\s\S]*?)(\s*\}\})$/ : /^(\{\{\s*)([\s\S]*?)(\s*\}\})$/;
  const m = re.exec(raw);
  if (!m) return null;
  return { prefix: m[1]!, inner: m[2]!, suffix: m[3]! };
}
