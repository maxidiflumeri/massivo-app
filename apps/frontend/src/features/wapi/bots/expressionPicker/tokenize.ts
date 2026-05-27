/**
 * 4.P — Tokenizador del texto del bot para syntax highlighting visual.
 *
 * Divide un string en segmentos de tres tipos:
 *  - `text`: texto plano (sin tokens).
 *  - `expr`: `{{= ... }}` cerrado correctamente → render como chip violeta.
 *  - `var`:  `{{name}}` plano cerrado → render como chip azul.
 *  - `bad`:  un `{{` (con o sin `=`) que NO se cerró → render rojo subrayado.
 *
 * El parser hace una pasada lineal sin regex global con backtracking — esto
 * garantiza output determinístico (orden + no superposiciones) y es robusto a
 * tokens malformados.
 *
 * Edge cases:
 *  - `{{= a }} {{= b }}`: dos tokens expr separados.
 *  - `{{= a `: token "bad" desde `{{` hasta el final del string.
 *  - `{{ name }}`: token "var" con espacios alrededor del identificador.
 *  - `{{ 1bad }}`: NO matchea como var (regex de nombre estricto) → queda como bad.
 *  - `{{= $f({{ x }}) }}`: el primer `}}` cierra la expresión externa (greedy NO,
 *    lazy SÍ — matcheamos el primer `}}` después de `{{=`). El `{{ x }}` queda
 *    como texto adentro del chip de expresión. Consecuencia: si el operador
 *    necesita `}}` literal adentro de una expresión, tiene que escapar — no
 *    soportado en MVP.
 */

export type TokenType = 'text' | 'expr' | 'var' | 'bad';

export interface Token {
  type: TokenType;
  /** Texto crudo del segmento (incluye los delimitadores para expr/var/bad). */
  raw: string;
  /** Offset de comienzo en el value original. */
  start: number;
  /** Offset (exclusivo) de fin en el value original. */
  end: number;
  /**
   * Para tokens `var`: el nombre extraído (sin `{{` `}}` ni espacios).
   * Para tokens `expr`: la expresión JSONata interna.
   */
  inner?: string;
}

const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function tokenize(value: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (until: number) => {
    if (until > textStart) {
      tokens.push({
        type: 'text',
        raw: value.slice(textStart, until),
        start: textStart,
        end: until,
      });
    }
  };

  while (i < value.length) {
    // Buscamos el próximo `{{`.
    if (value[i] === '{' && value[i + 1] === '{') {
      flushText(i);
      const tokenStart = i;
      i += 2;
      // ¿Es `{{=` (expresión) o `{{ name }}` (variable plana)?
      let isExpr = false;
      // Skipear whitespace después de `{{`.
      while (i < value.length && /\s/.test(value[i]!)) i += 1;
      if (value[i] === '=') {
        isExpr = true;
        i += 1;
      }
      // Buscar el cierre `}}`.
      const closeIdx = value.indexOf('}}', i);
      if (closeIdx === -1) {
        // Token sin cerrar → bad. Consumimos hasta el final.
        tokens.push({
          type: 'bad',
          raw: value.slice(tokenStart),
          start: tokenStart,
          end: value.length,
        });
        textStart = value.length;
        i = value.length;
        break;
      }
      // Inner: lo que está entre `{{=` (o `{{`) y `}}`, sin trim para preservar pos.
      const innerRaw = value.slice(i, closeIdx);
      const inner = innerRaw.trim();
      const tokenEnd = closeIdx + 2;
      if (isExpr) {
        tokens.push({
          type: 'expr',
          raw: value.slice(tokenStart, tokenEnd),
          start: tokenStart,
          end: tokenEnd,
          inner,
        });
      } else if (VAR_NAME_RE.test(inner)) {
        tokens.push({
          type: 'var',
          raw: value.slice(tokenStart, tokenEnd),
          start: tokenStart,
          end: tokenEnd,
          inner,
        });
      } else {
        // `{{...}}` con contenido que no es identificador válido. Lo marcamos
        // como `bad` para alertar al operador.
        tokens.push({
          type: 'bad',
          raw: value.slice(tokenStart, tokenEnd),
          start: tokenStart,
          end: tokenEnd,
        });
      }
      i = tokenEnd;
      textStart = tokenEnd;
    } else {
      i += 1;
    }
  }
  flushText(value.length);
  return tokens;
}
