/** Presets del selector de ventana. `custom` = el usuario eligió las fechas. */
export type MonitoringWindow = 7 | 30 | 'custom';

/** Rango pedido, en días locales YYYY-MM-DD y ambos extremos incluidos. */
export interface DayRange {
  from: string;
  to: string;
}

/** Rango que el backend dice haber usado. */
export interface RangeInfo {
  fromDay: string;
  toDay: string;
  days: number;
}

export interface MonitoringOverview {
  range: RangeInfo;
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

/** Una "visita": tramo del hilo separado del anterior por más de 30 min de silencio. */
export interface EpisodeItem {
  episodeId: string;
  startedAt: string;
  endedAt: string;
  messages: number;
  messagesIn: number;
  handedOff: boolean;
  firstInbound: string | null;
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

/** Un nodo del bot con cuánta gente pasó por él. */
export interface PathNode {
  nodeId: string;
  nodeKind: string | null;
  preview: string | null;
  /** Recorridos (pasadas por el flujo de punta a punta). Unidad del embudo. */
  recorridos: number;
  personas: number;
  pasadas: number;
}

export interface PathsOverview {
  range: RangeInfo;
  topics: Array<{
    topicId: string;
    recorridos: number;
    personas: number;
    pasadas: number;
    nodes: PathNode[];
  }>;
}

/** Un nodo del flujo tal como lo cuenta el informe: por visita, no por recorrido. */
export interface ReportNode {
  nodeId: string;
  nodeKind: string | null;
  preview: string | null;
  visits: number;
  people: number;
  passes: number;
}

export interface ReportTopic {
  topicId: string;
  visits: number;
  people: number;
  nodes: ReportNode[];
}

/**
 * Datos del informe descargable. Es un superconjunto del tablero: agrega lo que
 * sólo tiene sentido en un documento (fricción por nodo, entrega de documentos,
 * disponibilidad de los servicios externos).
 */
export interface MonitoringReport {
  range: RangeInfo;
  generatedAt: string;
  /** `BotEvent` se purga: más atrás de `availableFrom` no hay recorrido que contar. */
  events: { availableFrom: string | null; truncated: boolean };
  totals: {
    messagesIn: number;
    messagesOut: number;
    visits: number;
    people: number;
    newPeople: number;
    returningPeople: number;
    handoffs: number;
  };
  daily: Array<{ day: string; messagesIn: number; messagesOut: number; visits: number }>;
  hourly: Array<{ hour: number; messagesIn: number }>;
  engagement: {
    medianVisitSeconds: number;
    avgVisitSeconds: number;
    medianMessagesPerVisit: number;
    avgMessagesPerVisit: number;
    visitsPerPerson: { one: number; two: number; threeToFive: number; more: number; avg: number };
    replyP50Seconds: number | null;
    replyP95Seconds: number | null;
  };
  channels: Array<{ channelKind: string; visits: number }>;
  topics: ReportTopic[];
  media: {
    attempts: number;
    delivered: number;
    failed: number;
    byError: Array<{ error: string; status: number | null; count: number }>;
    byNode: Array<{
      topicId: string | null;
      nodeId: string;
      attempts: number;
      delivered: number;
      p50Ms: number | null;
    }>;
  };
  http: Array<{
    topicId: string | null;
    nodeId: string;
    endpoint: string | null;
    calls: number;
    errors: number;
    p50Ms: number | null;
    p95Ms: number | null;
  }>;
  captures: Array<{ topicId: string | null; nodeId: string; invalid: number }>;
}
