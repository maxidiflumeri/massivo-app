import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

/**
 * 4.N.3 / 4.P.1 — Token bucket por organización para limitar requests HTTP del bot.
 *
 * Respaldado por **Redis** (no en memoria) para que el límite sea global a todas
 * las instancias: con varias réplicas detrás de un LB, todas comparten el mismo
 * bucket por org → el límite efectivo es `capacity/min` real, no `N × capacity`.
 *
 * El consumo es atómico vía un script Lua (lectura + refill + decremento en una
 * sola operación, sin races entre instancias). Refill proporcional con el reloj
 * del **servidor Redis** (`TIME`), así no depende del clock de cada instancia:
 * tokens disponibles = `min(capacity, tokens + (now - lastRefill)/60s * capacity)`
 * — equivale a "capacity tokens cada 60s" con bursts hasta `capacity`.
 *
 * Capacity configurable vía env `WAPI_BOT_HTTP_PER_ORG_PER_MINUTE` (default 60).
 *
 * Fail-open: si Redis no responde, se permite el request (el rate limiter es un
 * throttle de seguridad, no un gate — preferimos no romper el bot por un hipo de
 * Redis).
 */
const DEFAULT_CAPACITY = 60;
const KEY_TTL_MS = 120_000;

// KEYS[1] = bucket key · ARGV[1] = capacity · ARGV[2] = ttl ms.
// Devuelve 1 si consumió un token, 0 si no había.
const ACQUIRE_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  lastRefill = now
end
local elapsed = now - lastRefill
if elapsed > 0 then
  tokens = math.min(capacity, tokens + (elapsed / 60000.0) * capacity)
  lastRefill = now
end
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', key, ttl)
return allowed
`;

@Injectable()
export class BotHttpRateLimiterService {
  private readonly logger = new Logger(BotHttpRateLimiterService.name);
  private readonly capacity: number;

  constructor(private readonly redis: RedisService) {
    const fromEnv = Number(process.env.WAPI_BOT_HTTP_PER_ORG_PER_MINUTE);
    this.capacity = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CAPACITY;
  }

  /**
   * Intenta consumir 1 token del bucket de `orgId`. Atómico en Redis. Devuelve
   * true si había token disponible. Fail-open ante error de Redis.
   */
  async tryAcquire(orgId: string): Promise<boolean> {
    try {
      const res = await this.redis.client.eval(
        ACQUIRE_LUA,
        1,
        `bot:httprate:${orgId}`,
        String(this.capacity),
        String(KEY_TTL_MS),
      );
      return Number(res) === 1;
    } catch (err) {
      this.logger.warn(
        `rate limiter Redis falló (fail-open) org=${orgId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  get capacityForTests(): number {
    return this.capacity;
  }
}
