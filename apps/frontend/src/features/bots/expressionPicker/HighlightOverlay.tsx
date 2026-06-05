/**
 * 4.P — Overlay de syntax highlighting para TextField/textarea.
 *
 * Se posiciona absoluto encima del textarea real (que tiene `color: transparent`),
 * tokeniza el `value` y dibuja chips coloreados sobre las posiciones reales del
 * texto.
 *
 * El overlay y el textarea **deben compartir font, padding, line-height,
 * letter-spacing y border-width** bit-perfect. Para no hardcodear, copiamos el
 * computed style del textarea al overlay en cada mount/resize/value-change.
 *
 * Posicionamiento: el overlay vive como hijo del mismo `<Box>` container que el
 * TextField. Su top/left/width/height se calculan via `getBoundingClientRect`
 * relativo al container (porque dentro del TextField hay un wrapper MUI que
 * agrega padding e introduce offset).
 */
import { useLayoutEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import { tokenize, type Token } from './tokenize';
import { splitTokenRaw, tokenizeExpression, type ExprSubToken } from './tokenizeExpression';

interface Props {
  value: string;
  /** Ref al elemento textarea/input real (no MUI wrapper). */
  textareaEl: HTMLTextAreaElement | HTMLInputElement | null;
  /** Container del par TextField + overlay (position: relative). */
  containerEl: HTMLElement | null;
}

function applyComputedStyles(
  textareaEl: HTMLTextAreaElement | HTMLInputElement,
  overlay: HTMLDivElement,
): void {
  const cs = getComputedStyle(textareaEl);
  overlay.style.fontFamily = cs.fontFamily;
  overlay.style.fontSize = cs.fontSize;
  overlay.style.fontWeight = cs.fontWeight;
  overlay.style.fontStyle = cs.fontStyle;
  overlay.style.lineHeight = cs.lineHeight;
  overlay.style.letterSpacing = cs.letterSpacing;
  overlay.style.padding = cs.padding;
  overlay.style.boxSizing = cs.boxSizing;
  overlay.style.borderWidth = '0px';
  overlay.style.whiteSpace = 'pre-wrap';
  overlay.style.wordBreak = 'break-word';
  overlay.style.overflowWrap = 'break-word';
}

function syncPosition(
  textareaEl: HTMLTextAreaElement | HTMLInputElement,
  containerEl: HTMLElement,
  overlay: HTMLDivElement,
): void {
  const taRect = textareaEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  overlay.style.top = `${taRect.top - containerRect.top}px`;
  overlay.style.left = `${taRect.left - containerRect.left}px`;
  overlay.style.width = `${taRect.width}px`;
  overlay.style.height = `${taRect.height}px`;
}

function syncScroll(
  textareaEl: HTMLTextAreaElement | HTMLInputElement,
  overlay: HTMLDivElement,
): void {
  overlay.scrollTop = textareaEl.scrollTop;
  overlay.scrollLeft = textareaEl.scrollLeft;
}

export function HighlightOverlay({ value, textareaEl, containerEl }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();

  useLayoutEffect(() => {
    if (!textareaEl || !overlayRef.current || !containerEl) return;
    const overlay = overlayRef.current;
    applyComputedStyles(textareaEl, overlay);
    syncPosition(textareaEl, containerEl, overlay);
    syncScroll(textareaEl, overlay);

    const onScroll = () => syncScroll(textareaEl, overlay);
    const ro = new ResizeObserver(() => {
      applyComputedStyles(textareaEl, overlay);
      syncPosition(textareaEl, containerEl, overlay);
      syncScroll(textareaEl, overlay);
    });
    ro.observe(textareaEl);
    ro.observe(containerEl);
    textareaEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      textareaEl.removeEventListener('scroll', onScroll);
    };
  }, [textareaEl, containerEl]);

  // Recalcular en cada cambio de value (autoresize de MUI multiline cambia altura).
  useLayoutEffect(() => {
    if (!textareaEl || !overlayRef.current || !containerEl) return;
    syncPosition(textareaEl, containerEl, overlayRef.current);
    syncScroll(textareaEl, overlayRef.current);
  }, [value, textareaEl, containerEl]);

  const tokens = tokenize(value);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      ref={overlayRef}
      aria-hidden="true"
      sx={{
        position: 'absolute',
        pointerEvents: 'none',
        overflow: 'hidden',
        color: 'text.primary',
        zIndex: 1,
      }}
    >
      {tokens.map((t, idx) => renderToken(t, idx, isDark))}
    </Box>
  );
}

// CRÍTICO: ningún estilo que altere las métricas del texto (font-weight, padding,
// letter-spacing, font-family, font-size). Si el overlay tiene anchos distintos
// al textarea, los clicks del usuario caen en posiciones incorrectas del cursor.
// Solo `color`, `background-color` y `text-decoration` son seguros — no afectan layout.

function renderToken(t: Token, idx: number, isDark: boolean) {
  if (t.type === 'text') {
    return (
      <span key={idx} style={{ color: 'inherit' }}>
        {t.raw}
      </span>
    );
  }
  if (t.type === 'var') {
    return renderVarToken(t, idx, isDark);
  }
  if (t.type === 'expr') {
    return renderExprToken(t, idx, isDark);
  }
  // bad
  return (
    <span
      key={idx}
      style={{
        backgroundColor: isDark ? 'rgba(244, 67, 54, 0.35)' : 'rgba(244, 67, 54, 0.25)',
        color: isDark ? '#ef9a9a' : '#b71c1c',
        textDecoration: 'underline wavy',
        textDecorationColor: isDark ? '#ef5350' : '#b71c1c',
      }}
    >
      {t.raw}
    </span>
  );
}

// Paleta de colores por sub-token. Cada uno es un par (light, dark).
const COLORS = {
  // Variable plana `{{nombre}}` — verde.
  varBg:    (d: boolean) => (d ? 'rgba(76, 175, 80, 0.35)' : 'rgba(76, 175, 80, 0.22)'),
  varText:  (d: boolean) => (d ? '#a5d6a7' : '#1b5e20'),
  // Función JSONata `$name` — violeta (color "destacado" del token expr).
  fnBg:     (d: boolean) => (d ? 'rgba(156, 39, 176, 0.45)' : 'rgba(156, 39, 176, 0.25)'),
  fnText:   (d: boolean) => (d ? '#e1bee7' : '#4a148c'),
  // Identificador / path adentro de una expresión — verde.
  identBg:  (d: boolean) => (d ? 'rgba(76, 175, 80, 0.30)' : 'rgba(76, 175, 80, 0.20)'),
  identText:(d: boolean) => (d ? '#a5d6a7' : '#1b5e20'),
  // String literal "..." — naranja.
  strBg:    (d: boolean) => (d ? 'rgba(255, 152, 0, 0.30)' : 'rgba(255, 152, 0, 0.22)'),
  strText:  (d: boolean) => (d ? '#ffcc80' : '#bf360c'),
  // Número — sin background, sólo color.
  numText:  (d: boolean) => (d ? '#90caf9' : '#0277bd'),
  // Delimitadores `{{=`, `}}`, paréntesis, operadores — fondo violeta suave para
  // indicar que estás dentro de un token expr.
  exprFrameBg: (d: boolean) => (d ? 'rgba(156, 39, 176, 0.18)' : 'rgba(156, 39, 176, 0.10)'),
  exprPunctText: (d: boolean) => (d ? '#ce93d8' : '#6a1b9a'),
};

function renderVarToken(t: Token, idx: number, isDark: boolean) {
  // `{{nombre}}` — pintamos delimitadores con color suave y el nombre con verde más vivo.
  // Usamos el `prefix`/`inner`/`suffix` parseado para no asumir el formato exacto.
  // Si no se puede parsear, fallback al render plano.
  return (
    <span
      key={idx}
      style={{ backgroundColor: COLORS.varBg(isDark), color: COLORS.varText(isDark) }}
    >
      {t.raw}
    </span>
  );
}

function renderExprToken(t: Token, idx: number, isDark: boolean) {
  // Render dos-niveles: fondo violeta tenue para todo el token, encima cada
  // sub-token (fn/var/str/num) sobre-pintado con su color propio.
  const split = splitTokenRaw(t.raw, 'expr');
  if (!split) {
    // Fallback si la regex no matchea (no debería pasar).
    return (
      <span
        key={idx}
        style={{ backgroundColor: COLORS.exprFrameBg(isDark), color: COLORS.exprPunctText(isDark) }}
      >
        {t.raw}
      </span>
    );
  }
  const subs = tokenizeExpression(split.inner);
  return (
    <span
      key={idx}
      style={{ backgroundColor: COLORS.exprFrameBg(isDark), color: COLORS.exprPunctText(isDark) }}
    >
      <span>{split.prefix}</span>
      {subs.map((s, si) => renderSubToken(s, si, isDark))}
      <span>{split.suffix}</span>
    </span>
  );
}

function renderSubToken(s: ExprSubToken, idx: number, isDark: boolean) {
  if (s.type === 'fn') {
    return (
      <span key={idx} style={{ backgroundColor: COLORS.fnBg(isDark), color: COLORS.fnText(isDark) }}>
        {s.raw}
      </span>
    );
  }
  if (s.type === 'var') {
    return (
      <span
        key={idx}
        style={{ backgroundColor: COLORS.identBg(isDark), color: COLORS.identText(isDark) }}
      >
        {s.raw}
      </span>
    );
  }
  if (s.type === 'str') {
    return (
      <span
        key={idx}
        style={{ backgroundColor: COLORS.strBg(isDark), color: COLORS.strText(isDark) }}
      >
        {s.raw}
      </span>
    );
  }
  if (s.type === 'num') {
    return (
      <span key={idx} style={{ color: COLORS.numText(isDark) }}>
        {s.raw}
      </span>
    );
  }
  // punct (operadores, paréntesis, comas, espacios) — sin fondo, color tenue.
  return (
    <span key={idx} style={{ color: COLORS.exprPunctText(isDark) }}>
      {s.raw}
    </span>
  );
}
