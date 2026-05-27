/**
 * 4.P — Catálogo curado de funciones JSONata para el ExpressionPicker.
 *
 * Selección de ~35 funciones más útiles para bots transaccionales. La lista
 * completa de JSONata es ~100 — limitamos para evitar overwhelm en el menú.
 * Si hace falta una específica, agregar acá.
 *
 * Cada entry trae:
 *  - `name`: con prefijo `$` (forma de llamarla en una expresión).
 *  - `category`: para agrupar en el menú.
 *  - `signature`: cómo se llama (con tipos de argumentos en pseudo-código).
 *  - `description`: explicación corta en español.
 *  - `example`: ejemplo entrada→salida.
 *  - `snippet`: lo que se inserta en el textfield al elegirla. Tiene un `|`
 *    marcando dónde dejar el cursor; al insertar se reemplaza por la posición
 *    real y el `|` se quita del string final.
 */

export type JsonataCategory = 'string' | 'number' | 'array' | 'date' | 'object' | 'logic';

export interface JsonataFnDoc {
  name: string;
  category: JsonataCategory;
  signature: string;
  description: string;
  example: string;
  /** Snippet con `|` marcando dónde dejar el cursor tras insertar. */
  snippet: string;
}

export const JSONATA_FUNCTIONS: JsonataFnDoc[] = [
  // ---- string ----
  {
    name: '$uppercase',
    category: 'string',
    signature: '$uppercase(str)',
    description: 'Convierte a MAYÚSCULAS.',
    example: '$uppercase("hola") → "HOLA"',
    snippet: '$uppercase(|)',
  },
  {
    name: '$lowercase',
    category: 'string',
    signature: '$lowercase(str)',
    description: 'Convierte a minúsculas.',
    example: '$lowercase("HOLA") → "hola"',
    snippet: '$lowercase(|)',
  },
  {
    name: '$substring',
    category: 'string',
    signature: '$substring(str, start, length?)',
    description: 'Extrae substring desde start (0-based) con longitud opcional.',
    example: '$substring("hola mundo", 5, 5) → "mundo"',
    snippet: '$substring(|, 0)',
  },
  {
    name: '$contains',
    category: 'string',
    signature: '$contains(str, sub)',
    description: 'Devuelve true si `str` contiene `sub`.',
    example: '$contains("hola mundo", "mundo") → true',
    snippet: '$contains(|, "")',
  },
  {
    name: '$replace',
    category: 'string',
    signature: '$replace(str, buscar, reemplazo)',
    description: 'Reemplaza ocurrencias de `buscar` por `reemplazo`.',
    example: '$replace("hola", "o", "0") → "h0la"',
    snippet: '$replace(|, "", "")',
  },
  {
    name: '$split',
    category: 'string',
    signature: '$split(str, sep)',
    description: 'Divide en array por el separador.',
    example: '$split("a,b,c", ",") → ["a","b","c"]',
    snippet: '$split(|, ",")',
  },
  {
    name: '$join',
    category: 'string',
    signature: '$join(arr, sep?)',
    description: 'Une array en un string con separador.',
    example: '$join(["a","b","c"], ", ") → "a, b, c"',
    snippet: '$join(|, ", ")',
  },
  {
    name: '$trim',
    category: 'string',
    signature: '$trim(str)',
    description: 'Quita espacios al principio y al final.',
    example: '$trim("  hola  ") → "hola"',
    snippet: '$trim(|)',
  },
  {
    name: '$length',
    category: 'string',
    signature: '$length(str)',
    description: 'Cantidad de caracteres de un string.',
    example: '$length("hola") → 4',
    snippet: '$length(|)',
  },
  {
    name: '$pad',
    category: 'string',
    signature: '$pad(str, width, char?)',
    description: 'Rellena hasta el ancho dado (negativo = derecha).',
    example: '$pad("5", 3, "0") → "500" / $pad("5", -3, "0") → "005"',
    snippet: '$pad(|, 3, "0")',
  },
  {
    name: '$string',
    category: 'string',
    signature: '$string(x)',
    description: 'Castea cualquier valor a string.',
    example: '$string(42) → "42"',
    snippet: '$string(|)',
  },
  // ---- number ----
  {
    name: '$sum',
    category: 'number',
    signature: '$sum(arr)',
    description: 'Suma los elementos de un array numérico.',
    example: '$sum([1, 2, 3]) → 6',
    snippet: '$sum(|)',
  },
  {
    name: '$average',
    category: 'number',
    signature: '$average(arr)',
    description: 'Promedio de un array numérico.',
    example: '$average([2, 4, 6]) → 4',
    snippet: '$average(|)',
  },
  {
    name: '$max',
    category: 'number',
    signature: '$max(arr)',
    description: 'Valor máximo de un array numérico.',
    example: '$max([1, 5, 3]) → 5',
    snippet: '$max(|)',
  },
  {
    name: '$min',
    category: 'number',
    signature: '$min(arr)',
    description: 'Valor mínimo de un array numérico.',
    example: '$min([1, 5, 3]) → 1',
    snippet: '$min(|)',
  },
  {
    name: '$round',
    category: 'number',
    signature: '$round(num, digits?)',
    description: 'Redondea (digits = cantidad de decimales, default 0).',
    example: '$round(3.567, 2) → 3.57',
    snippet: '$round(|, 2)',
  },
  {
    name: '$floor',
    category: 'number',
    signature: '$floor(num)',
    description: 'Redondea hacia abajo.',
    example: '$floor(3.9) → 3',
    snippet: '$floor(|)',
  },
  {
    name: '$ceil',
    category: 'number',
    signature: '$ceil(num)',
    description: 'Redondea hacia arriba.',
    example: '$ceil(3.1) → 4',
    snippet: '$ceil(|)',
  },
  {
    name: '$abs',
    category: 'number',
    signature: '$abs(num)',
    description: 'Valor absoluto.',
    example: '$abs(-5) → 5',
    snippet: '$abs(|)',
  },
  {
    name: '$number',
    category: 'number',
    signature: '$number(x)',
    description: 'Castea string/boolean a número.',
    example: '$number("42") → 42',
    snippet: '$number(|)',
  },
  // ---- array ----
  {
    name: '$count',
    category: 'array',
    signature: '$count(arr)',
    description: 'Cantidad de elementos.',
    example: '$count([1, 2, 3]) → 3',
    snippet: '$count(|)',
  },
  {
    name: '$filter',
    category: 'array',
    signature: '$filter(arr, fn)',
    description: 'Filtra elementos por predicado. `fn` recibe el item.',
    example: '$filter([1,2,3,4], function($v) { $v > 2 }) → [3,4]',
    snippet: '$filter(|, function($v) { $v })',
  },
  {
    name: '$map',
    category: 'array',
    signature: '$map(arr, fn)',
    description: 'Transforma cada elemento del array.',
    example: '$map([1,2,3], function($v) { $v * 2 }) → [2,4,6]',
    snippet: '$map(|, function($v) { $v })',
  },
  {
    name: '$reduce',
    category: 'array',
    signature: '$reduce(arr, fn, init?)',
    description: 'Acumula elementos del array. `fn($acc, $v)`.',
    example: '$reduce([1,2,3], function($a, $v) { $a + $v }, 0) → 6',
    snippet: '$reduce(|, function($acc, $v) { $acc + $v }, 0)',
  },
  {
    name: '$reverse',
    category: 'array',
    signature: '$reverse(arr)',
    description: 'Devuelve el array invertido.',
    example: '$reverse([1,2,3]) → [3,2,1]',
    snippet: '$reverse(|)',
  },
  {
    name: '$sort',
    category: 'array',
    signature: '$sort(arr, fn?)',
    description: 'Ordena ascendente; con `fn($a,$b)` devolviendo > 0 / < 0 / 0 cambia el orden.',
    example: '$sort([3,1,2]) → [1,2,3]',
    snippet: '$sort(|)',
  },
  {
    name: '$distinct',
    category: 'array',
    signature: '$distinct(arr)',
    description: 'Elimina duplicados manteniendo orden.',
    example: '$distinct([1,2,2,3]) → [1,2,3]',
    snippet: '$distinct(|)',
  },
  {
    name: '$append',
    category: 'array',
    signature: '$append(arr1, arr2)',
    description: 'Concatena dos arrays.',
    example: '$append([1,2], [3,4]) → [1,2,3,4]',
    snippet: '$append(|, [])',
  },
  // ---- date ----
  {
    name: '$now',
    category: 'date',
    signature: '$now()',
    description: 'Timestamp actual en formato ISO 8601 (UTC).',
    example: '$now() → "2026-05-22T03:00:00.000Z"',
    snippet: '$now()',
  },
  {
    name: '$millis',
    category: 'date',
    signature: '$millis()',
    description: 'Milisegundos desde epoch (UTC).',
    example: '$millis() → 1748487600000',
    snippet: '$millis()',
  },
  {
    name: '$fromMillis',
    category: 'date',
    signature: '$fromMillis(ms, picture?)',
    description: 'Convierte ms a string. `picture` soporta XPath3 (ej "[D01]/[M01]/[Y0001]").',
    example: '$fromMillis(1748487600000, "[D01]/[M01]/[Y0001]") → "29/05/2026"',
    snippet: '$fromMillis(|, "[D01]/[M01]/[Y0001]")',
  },
  {
    name: '$toMillis',
    category: 'date',
    signature: '$toMillis(iso)',
    description: 'Convierte string ISO a ms desde epoch.',
    example: '$toMillis("2026-05-22T03:00:00Z") → 1748487600000',
    snippet: '$toMillis(|)',
  },
  // ---- object ----
  {
    name: '$keys',
    category: 'object',
    signature: '$keys(obj)',
    description: 'Lista las claves de un objeto.',
    example: '$keys({"a":1,"b":2}) → ["a","b"]',
    snippet: '$keys(|)',
  },
  {
    name: '$lookup',
    category: 'object',
    signature: '$lookup(obj, key)',
    description: 'Lee una clave dinámica de un objeto.',
    example: '$lookup({"a":1}, "a") → 1',
    snippet: '$lookup(|, "")',
  },
  {
    name: '$merge',
    category: 'object',
    signature: '$merge([obj1, obj2, ...])',
    description: 'Funde objetos (las claves de los siguientes pisan a las anteriores).',
    example: '$merge([{"a":1},{"a":2,"b":3}]) → {"a":2,"b":3}',
    snippet: '$merge([|])',
  },
  {
    name: '$exists',
    category: 'object',
    signature: '$exists(expr)',
    description: 'true si la expresión devuelve un valor (no `undefined`).',
    example: '$exists(usuario.email) → true|false',
    snippet: '$exists(|)',
  },
  {
    name: '$type',
    category: 'object',
    signature: '$type(x)',
    description: 'Devuelve el tipo del valor: string|number|boolean|array|object|null.',
    example: '$type([1,2]) → "array"',
    snippet: '$type(|)',
  },
  // ---- logic ----
  {
    name: '$boolean',
    category: 'logic',
    signature: '$boolean(x)',
    description: 'Castea cualquier valor a boolean (truthy/falsy).',
    example: '$boolean("") → false / $boolean("ok") → true',
    snippet: '$boolean(|)',
  },
  {
    name: '$not',
    category: 'logic',
    signature: '$not(b)',
    description: 'Negación lógica.',
    example: '$not(true) → false',
    snippet: '$not(|)',
  },
];

export const CATEGORY_LABELS: Record<JsonataCategory, string> = {
  string: 'Cadenas',
  number: 'Números',
  array: 'Arrays',
  date: 'Fechas',
  object: 'Objetos',
  logic: 'Lógica',
};

export const CATEGORY_ORDER: JsonataCategory[] = [
  'string',
  'number',
  'array',
  'date',
  'object',
  'logic',
];

/**
 * Calcula el offset (en caracteres) del cursor relativo al snippet — la posición
 * del `|` en el snippet. Si no hay `|`, el cursor queda al final.
 */
export function snippetCursorOffset(snippet: string): number {
  const i = snippet.indexOf('|');
  return i === -1 ? snippet.length : i;
}

/** Quita el marcador `|` del snippet (lo que termina escribiéndose en el textfield). */
export function snippetText(snippet: string): string {
  return snippet.replace('|', '');
}
