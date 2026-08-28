/**
 * Gráficos del informe, como SVG plano.
 *
 * pdfmake dibuja SVG vectorial, así que el PDF sale con texto seleccionable y
 * sin rasterizar. No se usa `@mui/x-charts`: sus gráficos son React y viven en
 * el DOM, y llevarlos a un PDF obligaría a rasterizar la pantalla.
 *
 * Paleta: azul secuencial para las series de un solo color y una rampa ordinal
 * de cinco pasos para los rankings. Los pares que codifican estado
 * (entregado / no generado / otra falla) están elegidos para distinguirse
 * también con daltonismo, y siempre van acompañados de la etiqueta y del número,
 * nunca sólo del color.
 */

export const INK = '#0f172a';
export const INK2 = '#334155';
export const MUTED = '#64748b';
export const GRID = '#e2e8f0';
export const NAVY = '#1e3a8a';
export const ACCENT = '#2563eb';

const BLUE = '#2a78d6';
const BLUE_DARK = '#104281';
/** Tono de las barras del ranking. Más oscuro que el de las series porque
 *  adentro va texto blanco y tiene que leerse (≈5:1 de contraste). */
const BLUE_RANK = '#256abf';
export const OK = '#2a78d6';
export const BAD = '#d03b3b';
export const WARN = '#eda100';

/** Miles con punto y decimales con coma, como se escribe acá. */
export function nf(n: number): string {
  return Math.round(n).toLocaleString('es-AR');
}

export function pct(part: number, whole: number, d = 1): string {
  if (!whole) return '—';
  const v = (100 * part) / whole;
  // Un 99,96 % redondeado a un decimal se lee "100,0 %" y da a entender que no
  // quedó nadie afuera. Si no es el total exacto, se muestra con más precisión.
  const dd = part < whole && Number(v.toFixed(d)) >= 100 ? d + 1 : d;
  return `${v.toFixed(dd).replace('.', ',')} %`;
}

export function dec(n: number, d = 1): string {
  return n.toFixed(d).replace('.', ',');
}

/**
 * Convierte el texto de un nodo en una etiqueta presentable.
 *
 * Los textos vienen del flujo tal como los ve el ciudadano, así que traen cosas
 * que en un informe no van: emojis (que además Helvetica no sabe dibujar y
 * saldrían como cuadritos), los asteriscos con que WhatsApp marca la negrita y
 * plantillas sin resolver del estilo `{{totalInfracciones}}`. El paréntesis que
 * envuelve a una plantilla se va entero: dejarlo produce "(1 a )".
 */
export function sanitize(s: string | null | undefined, max = 46): string {
  if (!s) return '';
  const limpio = s
    .replace(/\([^()]*\{\{[^}]*\}\}[^()]*\)/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/[^ -~ -ÿ‘’“”–—·]/g, '')
    .replace(/\s+/g, ' ')
    // El preview viene recortado por el registrador, así que el paréntesis
    // puede haber quedado abierto: "…infracción (1 a".
    .replace(/\s*\([^()]*$/, '')
    .replace(/[\s\-–—:,;(]+$/, '')
    .trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/**
 * Dirección de un servicio, recortada a lo que se puede publicar: esquema, host
 * y el primer tramo del path. Más adentro puede haber identificadores que no
 * deberían circular en un documento —el slug del webhook de correo, por caso—, y
 * los parámetros el backend ya los sacó.
 */
export function endpointCorto(url: string | null): string {
  if (!url) return '';
  const m = /^([a-z]+:\/\/[^/]+)(\/[^/]*)?(\/.*)?$/i.exec(url.trim());
  if (!m) return sanitize(url, 60);
  return `${m[1]}${m[2] ?? ''}${m[3] ? '/…' : ''}`;
}

/** Etiqueta legible de un nodo: su texto si lo tiene, si no el id técnico. */
export function nodeLabel(node: { preview: string | null; nodeId: string }, max = 46): string {
  const t = sanitize(node.preview, max);
  return t || node.nodeId;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const T = (
  x: number,
  y: number,
  s: string,
  o: { size?: number; fill?: string; anchor?: string; weight?: number; opacity?: number } = {},
): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Helvetica" font-size="${o.size ?? 9}"` +
  ` fill="${o.fill ?? INK}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}` +
  `${o.weight ? ` font-weight="${o.weight}"` : ''}${o.opacity ? ` opacity="${o.opacity}"` : ''}>` +
  `${esc(s)}</text>`;

/** Barra vertical: punta redondeada arriba, base recta sobre el eje. */
function barV(x: number, y: number, w: number, h: number, fill: string, r = 3): string {
  if (h <= 0) return '';
  const rx = Math.min(r, w / 2, h);
  return (
    `<path d="M${x.toFixed(1)},${(y + h).toFixed(1)} V${(y + rx).toFixed(1)} ` +
    `A${rx},${rx} 0 0 1 ${(x + rx).toFixed(1)},${y.toFixed(1)} ` +
    `H${(x + w - rx).toFixed(1)} A${rx},${rx} 0 0 1 ${(x + w).toFixed(1)},${(y + rx).toFixed(1)} ` +
    `V${(y + h).toFixed(1)} Z" fill="${fill}"/>`
  );
}

/** Barra horizontal: punta redondeada a la derecha, arranque recto en el eje. */
function barH(x: number, y: number, w: number, h: number, fill: string, r = 3): string {
  if (w <= 0) return '';
  const rx = Math.min(r, h / 2, w);
  return (
    `<path d="M${x.toFixed(1)},${y.toFixed(1)} H${(x + w - rx).toFixed(1)} ` +
    `A${rx},${rx} 0 0 1 ${(x + w).toFixed(1)},${(y + rx).toFixed(1)} ` +
    `V${(y + h - rx).toFixed(1)} A${rx},${rx} 0 0 1 ${(x + w - rx).toFixed(1)},${(y + h).toFixed(1)} ` +
    `H${x.toFixed(1)} Z" fill="${fill}"/>`
  );
}

/** Tope de eje "redondo" por encima del máximo, para que la grilla dé números legibles. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (m * base >= max) return m * base;
  }
  return 10 * base;
}

function svg(w: number, h: number, body: string): string {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/**
 * Serie diaria. Una sola serie, un solo tono; el día pico va más oscuro y con
 * su valor escrito, que es el único que el lector busca puntualmente.
 * Con muchos días se etiqueta uno de cada N para que las fechas no se pisen.
 */
export function dailyChart(
  data: Array<{ day: string; visits: number }>,
  w = 700,
  h = 190,
): string {
  const L = 38;
  const R = 6;
  const Tp = 16;
  const B = 30;
  const pw = w - L - R;
  const ph = h - Tp - B;
  if (!data.length) return svg(w, h, T(L, Tp + ph / 2, 'Sin datos en el rango', { fill: MUTED }));

  const vals = data.map((d) => d.visits);
  const max = niceMax(Math.max(...vals, 1));
  const step = pw / data.length;
  const bw = Math.max(Math.min(step - 3, 26), 1);
  const peak = vals.indexOf(Math.max(...vals));
  // Una etiqueta cada `salto` días: por debajo de ~26 px no entra "05/08".
  const salto = Math.max(1, Math.ceil(data.length / 26));

  const out: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = Tp + ph - (ph * i) / 4;
    out.push(`<line x1="${L}" y1="${y.toFixed(1)}" x2="${w - R}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
    out.push(T(L - 5, y + 3, nf((max * i) / 4), { size: 7.5, fill: MUTED, anchor: 'end' }));
  }
  data.forEach((d, i) => {
    const bh = (ph * d.visits) / max;
    const x = L + i * step + (step - bw) / 2;
    out.push(barV(x, Tp + ph - bh, bw, bh, i === peak ? BLUE_DARK : BLUE));
    if (i % salto === 0) {
      out.push(T(x + bw / 2, Tp + ph + 11, d.day.slice(8, 10), { size: 7, fill: MUTED, anchor: 'middle' }));
    }
  });
  const px = L + peak * step + step / 2;
  const py = Tp + ph - (ph * vals[peak]!) / max;
  out.push(T(px, py - 4, nf(vals[peak]!), { size: 8.5, weight: 700, fill: BLUE_DARK, anchor: 'middle' }));
  out.push(T(L, h - 4, 'Día del mes', { size: 7.5, fill: MUTED }));
  return svg(w, h, out.join(''));
}

/** Distribución horaria. Una serie; la franja de mayor demanda se sombrea. */
export function hourlyChart(
  data: Array<{ hour: number; messagesIn: number }>,
  w = 700,
  h = 170,
): string {
  const L = 38;
  const R = 6;
  const Tp = 14;
  const B = 28;
  const pw = w - L - R;
  const ph = h - Tp - B;
  const vals = Array.from({ length: 24 }, (_, i) => data.find((d) => d.hour === i)?.messagesIn ?? 0);
  const max = niceMax(Math.max(...vals, 1));
  const step = pw / 24;
  const bw = Math.min(step - 4, 22);

  // Franja pico: la ventana de 5 horas seguidas que más concentra.
  let mejor = 0;
  let mejorSuma = -1;
  for (let i = 0; i <= 19; i++) {
    const s = vals.slice(i, i + 5).reduce((a, b) => a + b, 0);
    if (s > mejorSuma) {
      mejorSuma = s;
      mejor = i;
    }
  }
  const total = vals.reduce((a, b) => a + b, 0);

  const out: string[] = [];
  const bx0 = L + mejor * step;
  const bx1 = L + (mejor + 5) * step;
  out.push(`<rect x="${bx0.toFixed(1)}" y="${Tp}" width="${(bx1 - bx0).toFixed(1)}" height="${ph}" fill="#eff6ff"/>`);
  for (let i = 0; i <= 4; i++) {
    const y = Tp + ph - (ph * i) / 4;
    out.push(`<line x1="${L}" y1="${y.toFixed(1)}" x2="${w - R}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
    out.push(T(L - 5, y + 3, nf((max * i) / 4), { size: 7.5, fill: MUTED, anchor: 'end' }));
  }
  vals.forEach((v, i) => {
    const bh = (ph * v) / max;
    const x = L + i * step + (step - bw) / 2;
    out.push(barV(x, Tp + ph - bh, bw, bh, BLUE));
    if (i % 2 === 0) out.push(T(x + bw / 2, Tp + ph + 11, String(i), { size: 7, fill: MUTED, anchor: 'middle' }));
  });
  if (total > 0) {
    out.push(
      T((bx0 + bx1) / 2, Tp + 10, `franja pico ${mejor}–${mejor + 5} h · ${pct(mejorSuma, total)}`, {
        size: 7.5,
        weight: 700,
        fill: '#1c5cab',
        anchor: 'middle',
      }),
    );
  }
  out.push(T(L, h - 4, 'Hora del día', { size: 7.5, fill: MUTED }));
  return svg(w, h, out.join(''));
}

/**
 * Ranking horizontal: los pasos de un tema, de mayor a menor alcance. El ancho
 * es proporcional al primero, y el porcentaje se mide sobre la base que se pase
 * (las visitas del tema). Cuando la barra no da para la etiqueta, el bloque se
 * dibuja a su derecha en tinta: nunca texto claro fuera del relleno.
 */
export function rankingChart(
  rows: Array<{ label: string; value: number }>,
  base: number,
  w = 700,
  rowH = 30,
): string {
  if (!rows.length) return svg(w, 20, T(0, 14, 'Sin recorridos registrados', { fill: MUTED }));
  const h = rowH * rows.length - 6;
  const top = rows[0]!.value || 1;
  const pw = w - 74;
  const out: string[] = [];
  rows.forEach((r, i) => {
    const y = i * rowH;
    const bh = 24;
    const bwid = (pw * r.value) / top;
    // Un ranking es magnitud, no identidad: un solo tono para todas las filas.
    // (La rampa de varios pasos sólo tendría sentido con pocas etapas fijas; con
    // doce filas se agota y las últimas quedarían todas del mismo color.)
    out.push(barH(0, y, bwid, bh, BLUE_RANK, 4));
    const necesario = 10 + r.label.length * 4.9 + 46;
    const p = pct(r.value, base);
    if (bwid >= necesario) {
      out.push(T(10, y + 11, r.label, { size: 8, fill: '#ffffff', opacity: 0.9 }));
      out.push(T(10, y + 20.5, nf(r.value), { size: 10.5, weight: 700, fill: '#ffffff' }));
      out.push(T(bwid - 10, y + 17, p, { size: 10.5, weight: 700, fill: '#ffffff', anchor: 'end', opacity: 0.85 }));
    } else {
      const x = bwid + 8;
      out.push(T(x, y + 11, r.label, { size: 8, fill: INK2 }));
      out.push(T(x, y + 20.5, `${nf(r.value)}   ${p}`, { size: 10.5, weight: 700, fill: BLUE_RANK }));
    }
  });
  return svg(w, h, out.join(''));
}

/** Part-to-whole de una sola barra. Cada segmento lleva su % adentro y su
 *  etiqueta va en la tabla de al lado, nunca sólo el color. */
export function stackedBar(
  segs: Array<{ label: string; value: number; color: string }>,
  w = 700,
  h = 30,
): string {
  const total = segs.reduce((a, s) => a + s.value, 0);
  if (!total) return svg(w, h, T(0, 18, 'Sin pedidos en el rango', { fill: MUTED }));
  const util = w - 2 * (segs.length - 1);
  const out: string[] = [];
  let x = 0;
  segs.forEach((s, i) => {
    const sw = (util * s.value) / total;
    const r = 4;
    if (i === 0) {
      out.push(
        `<path d="M${(x + r).toFixed(1)},0 H${(x + sw).toFixed(1)} V${h} H${x.toFixed(1)} V${r} ` +
          `A${r},${r} 0 0 1 ${(x + r).toFixed(1)},0 Z" fill="${s.color}"/>`,
      );
    } else if (i === segs.length - 1) {
      out.push(
        `<path d="M${x.toFixed(1)},0 H${(x + sw - r).toFixed(1)} A${r},${r} 0 0 1 ${(x + sw).toFixed(1)},${r} ` +
          `V${h} H${x.toFixed(1)} Z" fill="${s.color}"/>`,
      );
    } else {
      out.push(`<rect x="${x.toFixed(1)}" y="0" width="${sw.toFixed(1)}" height="${h}" fill="${s.color}"/>`);
    }
    if (sw > 46) {
      out.push(T(x + sw / 2, h / 2 + 4, pct(s.value, total), { size: 11, weight: 700, fill: '#ffffff', anchor: 'middle' }));
    }
    x += sw + 2;
  });
  return svg(w, h, out.join(''));
}

/** Barrita para meter dentro de una celda de tabla. */
export function cellBar(value: number, max: number, w = 90, color = BLUE): string {
  const bw = max > 0 ? Math.max((w * value) / max, 1.5) : 0;
  return svg(w, 8, barH(0, 0, bw, 8, color, 2));
}
