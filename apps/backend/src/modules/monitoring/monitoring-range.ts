import { BadRequestException } from '@nestjs/common';

/**
 * Zona horaria de los cortes diarios. El bot atiende a la Provincia de Buenos
 * Aires: un mensaje de las 22:00 ART pertenece a ese día local, no al siguiente
 * UTC. Misma constante que usa `MonitoringService` para los buckets.
 */
export const TZ = 'America/Argentina/Buenos_Aires';

/** Tope de la ventana pedible. Más que esto no entra en un informe legible ni
 *  en una query razonable (el embudo cruza BotEvent con Message). */
export const MAX_RANGE_DAYS = 366;

export interface DateRange {
  /** Instante UTC del comienzo del primer día local (inclusive). */
  from: Date;
  /** Instante UTC del comienzo del día siguiente al último (exclusivo). */
  to: Date;
  /** Días locales que cubre el rango, ambos extremos incluidos. */
  days: number;
  /** Primer día local, YYYY-MM-DD. */
  fromDay: string;
  /** Último día local, YYYY-MM-DD. */
  toDay: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Desfasaje de `tz` respecto de UTC en ese instante, en ms (ART = −3 h). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') f[p.type] = Number(p.value);
  const g = (k: string): number => f[k] ?? 0;
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - at.getTime();
}

/** YYYY-MM-DD → [año, mes, día]. Ya validado por `DAY_RE` cuando viene de fuera. */
function ymd(day: string): [number, number, number] {
  const [y, m, d] = day.split('-');
  return [Number(y), Number(m), Number(d)];
}

/** Instante UTC de las 00:00 locales de `day` (YYYY-MM-DD). */
export function zonedDayStart(day: string, tz = TZ): Date {
  const [y, m, d] = ymd(day);
  const guess = Date.UTC(y, m - 1, d);
  // Dos pasadas: la primera usa el offset del instante equivocado. Con una
  // zona sin DST (Argentina) la segunda es idéntica; con DST corrige el borde.
  const once = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(once), tz));
}

/** `Date` → YYYY-MM-DD en hora local. `en-CA` da el formato ISO directo. */
export function zonedDayKey(at: Date, tz = TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Hoy en hora local, YYYY-MM-DD. */
export function today(tz = TZ): string {
  return zonedDayKey(new Date(), tz);
}

/** Suma días a una fecha local YYYY-MM-DD sin salir del calendario. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = ymd(day);
  const at = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return at.toISOString().slice(0, 10);
}

/**
 * Arma el rango a partir de los parámetros de la request. Acepta dos formas:
 *
 * - `from`/`to` (YYYY-MM-DD locales, ambos inclusive) — lo que usa el selector
 *   de fechas del panel y el informe.
 * - `days` (entero) — atajo para "los últimos N días contando hoy", que es
 *   como venían los presets de 7 y 30 días.
 *
 * Sin nada, cae en los últimos 7 días.
 */
export function parseRange(params: { from?: string; to?: string; days?: string }): DateRange {
  const { from, to, days } = params;

  if (from || to) {
    if (!from || !to) {
      throw new BadRequestException('Hay que mandar `from` y `to` juntos (YYYY-MM-DD)');
    }
    if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
      throw new BadRequestException('`from` y `to` deben tener formato YYYY-MM-DD');
    }
    return build(from, to);
  }

  const n = days === undefined ? 7 : Number(days);
  if (!Number.isInteger(n) || n < 1 || n > MAX_RANGE_DAYS) {
    throw new BadRequestException(`\`days\` debe ser un entero entre 1 y ${MAX_RANGE_DAYS}`);
  }
  const hoy = today();
  return build(addDays(hoy, -(n - 1)), hoy);
}

function build(fromDay: string, toDay: string): DateRange {
  const start = zonedDayStart(fromDay);
  // `to` es exclusivo: el comienzo del día siguiente. Así un rango de un solo
  // día cubre sus 24 horas y los BETWEEN no pierden el último mensaje.
  const end = zonedDayStart(addDays(toDay, 1));
  if (end <= start) {
    throw new BadRequestException('`from` no puede ser posterior a `to`');
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `El rango no puede superar los ${MAX_RANGE_DAYS} días (pediste ${days})`,
    );
  }
  return { from: start, to: end, days, fromDay, toDay };
}

/** Serie continua de días locales del rango, para no saltear fechas sin tráfico. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.fromDay; d <= range.toDay; d = addDays(d, 1)) out.push(d);
  return out;
}
