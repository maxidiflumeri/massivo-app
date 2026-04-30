import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';
import { SocketContextResolver } from './socket-context.resolver';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class AppGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(AppGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly events: EventsService,
    private readonly resolver: SocketContextResolver,
  ) {}

  afterInit(server: Server): void {
    this.events.setServer(server);
    server.use(async (socket, next) => {
      try {
        const ctx = await this.resolver.resolve(socket.handshake.auth);
        socket.data.context = ctx;
        next();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unauthorized';
        this.logger.warn(`socket rejected: ${msg}`);
        next(err instanceof Error ? err : new Error(msg));
      }
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const ctx = socket.data.context;
    if (!ctx) {
      socket.disconnect(true);
      return;
    }
    const rooms = EventsService.roomsFor(ctx.organizationId, ctx.teamId, ctx.userId);
    await socket.join(rooms);
    this.logger.log(`socket ${socket.id} joined ${rooms.join(', ')}`);
  }
}
