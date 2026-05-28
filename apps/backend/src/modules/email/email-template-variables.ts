/**
 * Catálogo base de variables disponibles para interpolar (Handlebars) en
 * subjects y HTML de templates de email.
 *
 * Estas keys coinciden con el shape de `Contact` (identity cross-canal) y
 * con los campos que el loader de campañas mapea sobre `EmailContact.data`.
 * Cada entry trae un `sample` para usar en previews y test-sends cuando el
 * usuario no provee data propia.
 *
 * Si necesitás keys custom (ej. `orderId`, `totalAmount`), no agregues acá:
 * vienen automáticamente del endpoint `variables-catalog`, que las descubre
 * de `EmailContact.data` en campañas previas que usaron el template.
 */
export interface EmailTemplateVariableDef {
  key: string;
  label: string;
  sample: string;
}

export const CONTACT_BASE_VARIABLES: EmailTemplateVariableDef[] = [
  { key: 'firstName', label: 'Nombre', sample: 'Juan' },
  { key: 'lastName', label: 'Apellido', sample: 'Pérez' },
  { key: 'email', label: 'Email', sample: 'juan.perez@example.com' },
  { key: 'phoneE164', label: 'Teléfono', sample: '+5491100000000' },
  { key: 'externalId', label: 'ID externo', sample: 'EMP-001' },
  { key: 'dni', label: 'DNI', sample: '30000000' },
  { key: 'cuit', label: 'CUIT', sample: '20-30000000-7' },
];

/**
 * Construye un object con los samples del catálogo base para usar como
 * defaults en preview/test-send cuando el usuario no provee data propia.
 */
export function buildBaseSampleData(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of CONTACT_BASE_VARIABLES) out[v.key] = v.sample;
  return out;
}

export const CONTACT_BASE_VARIABLE_KEYS: ReadonlySet<string> = new Set(
  CONTACT_BASE_VARIABLES.map((v) => v.key),
);
