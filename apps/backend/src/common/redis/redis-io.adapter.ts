import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import { RedisService } from './redis.service';

/**
 * Adapter de socket.io respaldado por Redis (pub/sub). Sin esto, con varias
 * instancias detrás de un LB un `emitToTeam/emitToUser/emitToWebchatVisitor`
 * sólo llega a los clientes conectados a ESA instancia → inbox en vivo,
 * notificaciones y webchat se romperían en silencio.
 *
 * Se aplica a nivel del io Server raíz (`createIOServer`), así cubre todos los
 * namespaces (default + `/webchat`). No hay que tocar `EventsService`: los
 * `.to(room).emit()` se propagan a todas las instancias automáticamente.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  /** Crea el par pub/sub dedicado (debe llamarse antes de `useWebSocketAdapter`). */
  connect(): void {
    const pub = this.redis.createClient('socket-pub', { maxRetriesPerRequest: null });
    const sub = this.redis.createClient('socket-sub', { maxRetriesPerRequest: null });
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
