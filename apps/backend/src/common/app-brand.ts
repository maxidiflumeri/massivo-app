/**
 * Marca de la app (white-label). Default "Massivo"; se cambia seteando `APP_NAME`
 * en el entorno del backend (ver `.env`). Es una función (no una constante) para
 * leer el env en runtime y no en import-time.
 */
export function appName(): string {
  return process.env.APP_NAME?.trim() || 'Massivo';
}
