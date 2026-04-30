import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server } from 'socket.io';

interface ThrottleState {
  lastEmitAt: number;
  tailTimer: NodeJS.Timeout | null;
  latestPayload: unknown;
}

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private server: Server | null = null;
  private throttleState = new Map<string, ThrottleState>();

  setServer(server: Server): void {
    this.server = server;
  }

  emitToTeam(teamId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`team:${teamId}`).emit(event, payload);
  }

  /**
   * Throttle leading+trailing por (teamId, event, key): emite inmediato si la
   * última emisión fue hace ≥ `intervalMs`, y siempre agenda un trailing emit
   * con el payload más reciente del burst. Esto garantiza progreso visible
   * en el frontend (1 emit/seg como mucho) durante envíos masivos, donde un
   * debounce puro nunca dispara porque cada nuevo update reinicia el timer.
   */
  emitToTeamDebounced(
    teamId: string,
    event: string,
    key: string,
    payload: unknown,
    intervalMs = 1000,
  ): void {
    if (!this.server) return;
    const cacheKey = `${teamId}|${event}|${key}`;
    const now = Date.now();
    const state = this.throttleState.get(cacheKey);

    if (!state) {
      this.server.to(`team:${teamId}`).emit(event, payload);
      this.throttleState.set(cacheKey, {
        lastEmitAt: now,
        tailTimer: null,
        latestPayload: payload,
      });
      return;
    }

    state.latestPayload = payload;
    const elapsed = now - state.lastEmitAt;
    if (elapsed >= intervalMs) {
      this.server.to(`team:${teamId}`).emit(event, payload);
      state.lastEmitAt = now;
      if (state.tailTimer) {
        clearTimeout(state.tailTimer);
        state.tailTimer = null;
      }
      return;
    }
    if (state.tailTimer) return;
    state.tailTimer = setTimeout(() => {
      const s = this.throttleState.get(cacheKey);
      if (!s) return;
      s.tailTimer = null;
      s.lastEmitAt = Date.now();
      this.server?.to(`team:${teamId}`).emit(event, s.latestPayload);
    }, intervalMs - elapsed);
  }

  onModuleDestroy(): void {
    for (const s of this.throttleState.values()) {
      if (s.tailTimer) clearTimeout(s.tailTimer);
    }
    this.throttleState.clear();
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
