import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

/**
 * Conexiones Redis compartidas (reusa `REDIS_HOST/PORT/PASSWORD`, los mismos que
 * las colas BullMQ). Dos usos:
 *  - `client`: cliente de propósito general (estado del sandbox cross-instancia,
 *    locks futuros, etc.).
 *  - `createClient()`: conexiones dedicadas — el adapter Redis de socket.io necesita
 *    un par pub/sub propio (una conexión en modo subscriber no puede usarse para
 *    comandos normales).
 *
 * Necesario para escalar horizontal: con varias instancias detrás de un LB, el
 * estado efímero que antes vivía en memoria de proceso (sandbox) y el ruteo de
 * eventos de socket pasan por Redis para que todas las instancias lo compartan.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly clients: Redis[] = [];

  /** Cliente compartido de propósito general. */
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = this.createClient('shared');
  }

  /**
   * Crea una conexión nueva. `extra` permite, p.ej., `maxRetriesPerRequest: null`
   * para las conexiones long-lived del adapter de socket.io.
   */
  createClient(label = 'client', extra: Partial<RedisOptions> = {}): Redis {
    const client = new Redis({ ...this.baseOptions(), ...extra });
    client.on('error', (err) => this.logger.warn(`redis[${label}] error: ${err.message}`));
    this.clients.push(client);
    return client;
  }

  private baseOptions(): RedisOptions {
    return {
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(this.config.get<string>('REDIS_PORT') ?? 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.clients.map((c) => c.quit()));
  }
}
