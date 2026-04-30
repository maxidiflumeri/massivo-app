import { createHash } from 'crypto';

/**
 * Normaliza email a lowercase + trim antes de hashear con SHA-256. El hash es
 * el campo único que indexamos para suppression — guardamos el email plano
 * también pero la búsqueda se hace por hash para evitar issues de case y para
 * permitir un futuro borrado de PII manteniendo la lista de bloqueo.
 */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}
