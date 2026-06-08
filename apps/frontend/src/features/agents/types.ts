export interface AgentChannelRef {
  id: string;
  name: string | null;
  kind: string;
}

export interface Agent {
  id: string;
  name: string;
  enabled: boolean;
  /** "provider/model". */
  model: string;
  systemPrompt: string | null;
  temperature: number;
  maxSteps: number;
  settings?: unknown;
  createdAt: string;
  updatedAt: string;
  channels?: AgentChannelRef[];
}

export interface UpdateAgentPayload {
  name?: string;
  enabled?: boolean;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxSteps?: number;
}

/** Modelos sugeridos en el selector (se puede escribir otro a mano). */
export const AGENT_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rápido y económico' },
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — equilibrado' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini — OpenAI' },
  { value: 'openai/gpt-4o', label: 'GPT-4o — OpenAI' },
];
