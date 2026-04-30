import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { EventsService } from './events.service';
import { SocketContextResolver } from './socket-context.resolver';

@Module({
  providers: [AppGateway, EventsService, SocketContextResolver],
  exports: [EventsService],
})
export class EventsModule {}
