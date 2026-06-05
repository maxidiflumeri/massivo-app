import { Injectable } from '@nestjs/common';

/**
 * 4.N.3 — Token bucket por organización para limitar requests HTTP del bot.
 * In-memory por proceso: si el backend escala a múltiples instancias, cada una
 * tiene su propio bucket → el límite efectivo es N × capacity. Aceptable en el
 * MVP; persistir en Redis queda como 4.P.1 (ver MIGRATION_PLAN).
 *
 * Refill proporcional: en cualquier instante, los tokens disponibles son
 * `min(capacity, tokens + (now - lastRefill) / 60_000 * capacity)`. Eso es
 * equivalente a "capacity tokens cada 60s" pero sin contention en el clock
 * y soporta bursts hasta `capacity`.
 *
 * Capacity configurable vía env `WAPI_BOT_HTTP_PER_ORG_PER_MINUTE` (default 60).
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_CAPACITY = 60;

@Injectable()
export class BotHttpRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;

  constructor() {
    const fromEnv = Number(process.env.WAPI_BOT_HTTP_PER_ORG_PER_MINUTE);
    this.capacity = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CAPACITY;
  }

  /**
   * Intenta consumir 1 token del bucket de `orgId`. Devuelve true si había token
   * disponible, false si no. El refill es lazy (no usa timers/intervals).
   */
  tryAcquire(orgId: string): boolean {
    const now = Date.now();
    const existing = this.buckets.get(orgId);
    const b: Bucket = existing
      ? { tokens: existing.tokens, lastRefill: existing.lastRefill }
      : { tokens: this.capacity, lastRefill: now };

    const elapsedMs = now - b.lastRefill;
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 60_000) * this.capacity;
      b.tokens = Math.min(this.capacity, b.tokens + refill);
      b.lastRefill = now;
    }

    if (b.tokens < 1) {
      this.buckets.set(orgId, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(orgId, b);
    return true;
  }

  /** Lectura de debug. NO usar para tomar decisiones (no es atómico contra tryAcquire). */
  remainingTokens(orgId: string): number {
    const b = this.buckets.get(orgId);
    if (!b) return this.capacity;
    const elapsedMs = Date.now() - b.lastRefill;
    const projected = Math.min(this.capacity, b.tokens + (elapsedMs / 60_000) * this.capacity);
    return Math.floor(projected);
  }

  /** Útil sólo para tests. */
  _resetForTests(): void {
    this.buckets.clear();
  }

  get capacityForTests(): number {
    return this.capacity;
  }
}
