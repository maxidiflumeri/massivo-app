import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  type AgentMessage,
  type ModelGenerateInput,
  type ModelGenerateResult,
  type ModelProvider,
  ModelProviderError,
  type ToolCall,
} from './model-types';

/** Proveedor Anthropic (Claude) vía `@anthropic-ai/sdk` (CJS). */
@Injectable()
export class AnthropicModelProvider implements ModelProvider {
  readonly id = 'anthropic';
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ModelProviderError('Falta ANTHROPIC_API_KEY', this.id);
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const client = this.getClient();
    const resp = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens ?? 1024,
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
      ...(input.system ? { system: input.system } : {}),
      ...(input.tools?.length
        ? {
            tools: input.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
      messages: toAnthropicMessages(input.messages),
    });

    const text =
      resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('') || null;

    const toolCalls: ToolCall[] = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, arguments: (b.input ?? {}) as Record<string, unknown> }));

    return {
      text,
      toolCalls,
      finishReason:
        resp.stop_reason === 'tool_use'
          ? 'tool_calls'
          : resp.stop_reason === 'max_tokens'
            ? 'length'
            : resp.stop_reason === 'end_turn'
              ? 'stop'
              : 'other',
      usage: { inputTokens: resp.usage?.input_tokens, outputTokens: resp.usage?.output_tokens },
    };
  }
}

/**
 * Normalizado → formato Anthropic. Claude representa los resultados de tools como
 * un mensaje `user` con bloques `tool_result`; agrupamos los `role:'tool'`
 * consecutivos en un solo mensaje user (uno por cada tool_use del turno previo).
 */
function toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flush = () => {
    if (pendingToolResults.length) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'tool') {
      pendingToolResults.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
      continue;
    }
    flush();
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : '(sin contenido)' });
    }
  }
  flush();
  return out;
}
