import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

/**
 * 4.R — Correlation IDs que viajan junto a cada operación. Cualquier log
 * estructurado emitido por el EventLogger se enriquece automáticamente con
 * lo que esté presente en este store en el momento de la llamada.
 *
 * Todos los campos son opcionales: el subset disponible depende del punto
 * de entrada (HTTP request, webhook Meta, scheduler tick, etc).
 */
export interface ObsFields {
  /** UUID corto (8 chars hex) que une toda la cascada disparada por un
   *  único evento. Se genera en el entry point y se hereda por todos los
   *  async hijos vía AsyncLocalStorage. */
  traceId?: string;
  phone?: string;
  sessionId?: string;
  conversationId?: string;
  configId?: string;
  // Email-specific — campaña y report individual. Permiten buscar todos los
  // eventos de un envío puntual o de una campaña entera (incluso descendiente
  // de SES webhooks vía resolveTenant).
  campaignId?: string;
  reportId?: string;
  // Webhook receivers — identifica el evento externo (svix/SNS/messageId
  // según provider) para que receive + process queden unidos.
  webhookEventId?: string;
  // Tenant info — opcional cuando el entry point es un webhook público
  // (Meta/SES/Clerk) que aún no resolvió a qué org/team pertenece.
  organizationId?: string;
  teamId?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<ObsFields>();

export class ObservabilityContext {
  /** Abre un nuevo scope con los fields dados. Hereda todo lo que ya hubiera
   *  en el store padre (merge superficial). */
  static run<R>(fields: ObsFields, cb: () => R): R {
    const merged = { ...this.current(), ...fields };
    return storage.run(merged, cb);
  }

  /** Devuelve el store actual o {} si no hay scope activo. Nunca devuelve
   *  null para que los callers no tengan que chequear. */
  static current(): ObsFields {
    return storage.getStore() ?? {};
  }

  /** Enriquece el store actual sin abrir un nuevo scope. Útil cuando
   *  descubrís el sessionId o phone DENTRO de la cadena (ej: el bot engine
   *  carga la sesión después de que el webhook arrancó el scope). */
  static augment(fields: Partial<ObsFields>): void {
    const current = storage.getStore();
    if (current) Object.assign(current, fields);
  }

  /** UUID compacto (8 chars hex). Suficiente entropía para correlar
   *  eventos durante una ventana razonable (millones de traceIds por día
   *  sin colisiones prácticas). */
  static newTraceId(): string {
    return randomBytes(4).toString('hex');
  }
}
