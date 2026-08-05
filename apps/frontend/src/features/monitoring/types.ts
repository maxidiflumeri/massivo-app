export type MonitoringWindow = 7 | 30;

export interface MonitoringOverview {
  windowDays: MonitoringWindow;
  from: string;
  to: string;
  totals: {
    /** Creadas en la ventana. */
    conversations: number;
    /** Con al menos un mensaje en la ventana (aunque sean más viejas). */
    conversationsActive: number;
    messagesIn: number;
    messagesOut: number;
    handoffs: number;
    activeSessions: number;
  };
  /** Serie continua (incluye días sin tráfico). `day` = YYYY-MM-DD hora local. */
  days: Array<{
    day: string;
    conversations: number;
    messagesIn: number;
    messagesOut: number;
  }>;
  hourly: Array<{ hour: number; messagesIn: number }>;
  byChannel: Array<{ channelKind: string; conversations: number }>;
  botVsEscalated: { bot: number; escalated: number };
}

/** Un paso del recorrido del bot. `kind` es el mismo nombre del log del backend. */
export interface BotEventItem {
  id: string;
  kind: string;
  nodeId: string | null;
  nodeKind: string | null;
  topicId: string | null;
  sessionId: string | null;
  payload: BotEventPayload | null;
  createdAt: string;
}

/** Campos que puede traer `payload` según el `kind` (todos opcionales). */
export interface BotEventPayload {
  textPreview?: string;
  varName?: string;
  value?: unknown;
  input?: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
  mediaType?: string;
  escalate?: boolean;
  reason?: string;
}

export interface BotSessionSnapshot {
  currentNodeId: string;
  currentTopicId: string | null;
  startedAt: string;
  lastInboundAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedReason: string | null;
  data: Record<string, unknown> | null;
}
