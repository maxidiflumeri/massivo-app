import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  type AgentMessage,
  type ModelGenerateInput,
  type ModelGenerateResult,
  type ModelProvider,
  ModelProviderError,
  type ToolCall,
} from './model-types';

/**
 * Proveedor compatible con la Chat Completions API de OpenAI. Una sola
 * implementación cubre **OpenAI** y **OpenRouter** (mismo wire protocol, distinto
 * `baseURL` + key) → con un adapter accedés a decenas de modelos.
 */
abstract class OpenAiCompatibleProvider implements ModelProvider {
  abstract readonly id: string;
  protected abstract readonly apiKeyEnv: string;
  protected abstract readonly baseURL: string | undefined;
  private client: OpenAI | null = null;

  constructor(protected readonly config: ConfigService) {}

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>(this.apiKeyEnv);
    if (!apiKey) throw new ModelProviderError(`Falta ${this.apiKeyEnv}`, this.id);
    this.client = new OpenAI({ apiKey, ...(this.baseURL ? { baseURL: this.baseURL } : {}) });
    return this.client;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const client = this.getClient();
    const messages = toOpenAiMessages(input.system, input.messages);
    const resp = await client.chat.completions.create({
      model: input.model,
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      messages: messages as never,
      ...(input.tools?.length
        ? {
            tools: input.tools.map((t) => ({
              type: 'function' as const,
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
            tool_choice: 'auto' as const,
          }
        : {}),
    });

    const choice = resp.choices[0];
    const msg = choice?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
      .filter((tc) => tc.type === 'function')
      .map((tc) => {
        const fn = tc as { id: string; function: { name: string; arguments: string } };
        return { id: fn.id, name: fn.function.name, arguments: safeParse(fn.function.arguments) };
      });

    return {
      text: msg?.content ?? null,
      toolCalls,
      finishReason:
        choice?.finish_reason === 'tool_calls'
          ? 'tool_calls'
          : choice?.finish_reason === 'length'
            ? 'length'
            : choice?.finish_reason === 'stop'
              ? 'stop'
              : 'other',
      usage: { inputTokens: resp.usage?.prompt_tokens, outputTokens: resp.usage?.completion_tokens },
    };
  }
}

@Injectable()
export class OpenAiModelProvider extends OpenAiCompatibleProvider {
  readonly id = 'openai';
  protected readonly apiKeyEnv = 'OPENAI_API_KEY';
  protected readonly baseURL = undefined;

  // Constructor explícito OBLIGATORIO: sin él, TS no emite `design:paramtypes` en
  // la subclase y Nest la instancia sin args → `this.config` queda undefined.
  constructor(config: ConfigService) {
    super(config);
  }
}

@Injectable()
export class OpenRouterModelProvider extends OpenAiCompatibleProvider {
  readonly id = 'openrouter';
  protected readonly apiKeyEnv = 'OPENROUTER_API_KEY';
  protected readonly baseURL = 'https://openrouter.ai/api/v1';

  constructor(config: ConfigService) {
    super(config);
  }
}

/**
 * Google Gemini vía su **endpoint compatible con OpenAI**
 * (`/v1beta/openai/`). Tier gratis en Google AI Studio (key gratis, sin tarjeta,
 * con límites de rate) → ideal para probar sin pagar. Modelos: `gemini-2.0-flash`,
 * `gemini-2.5-flash`, etc. (string del agente: `gemini/gemini-2.0-flash`).
 */
@Injectable()
export class GeminiModelProvider extends OpenAiCompatibleProvider {
  readonly id = 'gemini';
  protected readonly apiKeyEnv = 'GEMINI_API_KEY';
  protected readonly baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

  constructor(config: ConfigService) {
    super(config);
  }
}

/**
 * Groq vía su **endpoint compatible con OpenAI** (`/openai/v1`). Free tier muy
 * generoso (key gratis, sin tarjeta): ~30 RPM / ~1000 RPD según el modelo —
 * mucho mejor que Gemini free para probar. Inferencia rapidísima y con
 * tool-calling. Modelos: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, etc.
 * (string del agente: `groq/llama-3.3-70b-versatile`).
 */
@Injectable()
export class GroqModelProvider extends OpenAiCompatibleProvider {
  readonly id = 'groq';
  protected readonly apiKeyEnv = 'GROQ_API_KEY';
  protected readonly baseURL = 'https://api.groq.com/openai/v1';

  constructor(config: ConfigService) {
    super(config);
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Normalizado → mensajes Chat Completions (system como primer mensaje). */
function toOpenAiMessages(system: string | undefined, messages: AgentMessage[]): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else {
      out.push({
        role: 'assistant',
        content: m.content ?? '',
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      });
    }
  }
  return out;
}
