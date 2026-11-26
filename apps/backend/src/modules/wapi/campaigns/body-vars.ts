/**
 * Resolución de las variables del body de un template WAPI
 * (`campaign.config.bodyVars`). Cada spec es el NOMBRE de una columna de
 * `WapiContact.data` (no un valor literal): `{{1}}` → `"nombre"` → `data.nombre`.
 *
 * Compartido entre el worker (arma los components al enviar) y
 * `WapiCampaignsService.send()` (valida el mapeo antes de pasar la campaña a
 * PROCESSING), para que ambos resuelvan exactamente igual.
 */

export function readBodyVars(campaignConfig: unknown): string[] {
  const vars = ((campaignConfig ?? {}) as { bodyVars?: unknown }).bodyVars;
  return Array.isArray(vars) ? (vars as string[]) : [];
}

/**
 * Valor de la variable `spec` para un contacto, trimmeado. `''` si la columna
 * no existe o está vacía.
 *
 * Fallback: si la spec es "name"/"nombre" y data no la tiene, usa el escalar
 * `contact.name`. Rescata contactos cargados antes del fix del parser que
 * hoisteaba name/nombre fuera de data.
 */
export function resolveBodyVar(
  spec: string,
  contactData: unknown,
  contactName: string | null = null,
): string {
  const data = (contactData ?? {}) as Record<string, unknown>;
  let value = data[spec];
  if ((value === undefined || value === null || value === '') && contactName) {
    const k = spec.toLowerCase();
    if (k === 'name' || k === 'nombre') value = contactName;
  }
  return value === undefined || value === null ? '' : String(value).trim();
}
