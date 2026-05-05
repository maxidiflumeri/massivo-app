import { createHash } from 'crypto';

/**
 * Normaliza phone (trim + sólo dígitos) y devuelve SHA-256 hex. Usado por
 * WapiOptOut para indexar y dedupar el unique constraint sin exponer el
 * número plano. Mantiene paridad con `hashEmail()` del módulo email.
 */
export function hashPhone(phone: string): string {
  const normalized = phone.trim().replace(/\D+/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
