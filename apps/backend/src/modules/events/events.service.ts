import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private server: Server | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  setServer(server: Server): void {
    this.server = server;
  }

  emitToTeam(teamId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`team:${teamId}`).emit(event, payload);
  }

  /**
   * Coalesce un burst de emisiones (mismo teamId+event+key) en una sola emisión
   * que dispara tras `delayMs` sin recibir nuevos eventos. Usa el payload de la
   * llamada más reciente. Útil para `email.report.updated` cuando un worker
   * procesa decenas de reports/segundo y queremos refrescar el dashboard sin
   * spamear sockets.
   */
  emitToTeamDebounced(
    teamId: string,
    event: string,
    key: string,
    payload: unknown,
    delayMs = 1000,
  ): void {
    if (!this.server) return;
    const cacheKey = `${teamId}|${event}|${key}`;
    const existing = this.debounceTimers.get(cacheKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(cacheKey);
      this.server?.to(`team:${teamId}`).emit(event, payload);
    }, delayMs);
    this.debounceTimers.set(cacheKey, timer);
  }

  onModuleDestroy(): void {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
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
