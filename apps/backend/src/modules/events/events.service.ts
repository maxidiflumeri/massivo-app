import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToTeam(teamId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`team:${teamId}`).emit(event, payload);
  }

  emitToOrg(organizationId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  static roomsFor(orgId: string, teamId: string, userId: string): string[] {
    return [`org:${orgId}`, `team:${teamId}`, `user:${userId}`];
  }
}
