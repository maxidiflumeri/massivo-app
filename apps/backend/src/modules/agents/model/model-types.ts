/**
 * Abstracción de proveedor de modelos (gateway). Mismo patrón que `ChannelAdapter`:
 * el runtime del agente trabaja contra una interfaz normalizada y cada proveedor
 * (Anthropic, OpenAI/OpenRouter) traduce a/desde su SDK. Así soportamos varios
 * proveedores sin atar el runtime a ninguno.
 */

/** Definición de una tool expuesta al modelo (JSON Schema en `parameters`). */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema del objeto de argumentos. */
  parameters: Record<string, unknown>;
}

/** Pedido de ejecución de tool que devuelve el modelo. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Mensaje normalizado del historial de la conversación con el modelo. */
export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ModelGenerateInput {
  /** Id "pelado" del modelo (sin el prefijo de proveedor, que ya resolvió el gateway). */
  model: string;
  system?: string;
  messages: AgentMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelGenerateResult {
  /** Texto del asistente (puede ser null si sólo pidió tools). */
  text: string | null;
  /** Tools que el modelo quiere ejecutar (vacío si terminó). */
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'other';
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Un proveedor concreto (Anthropic, OpenAI, …). */
export interface ModelProvider {
  readonly id: string;
  generate(input: ModelGenerateInput): Promise<ModelGenerateResult>;
}

/** Error de configuración (ej. falta la API key del proveedor). */
export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = 'ModelProviderError';
  }
}
