import { Injectable } from '@nestjs/common';
import { AnthropicModelProvider } from './anthropic.provider';
import { GeminiModelProvider, OpenAiModelProvider, OpenRouterModelProvider } from './openai.provider';
import {
  type ModelGenerateInput,
  type ModelGenerateResult,
  type ModelProvider,
  ModelProviderError,
} from './model-types';

/**
 * Gateway multi-proveedor. El `model` del agente es `"provider/modelId"`:
 *  - `anthropic/claude-haiku-4-5-20251001`
 *  - `openai/gpt-4o-mini`
 *  - `openrouter/anthropic/claude-3.5-sonnet` (OpenRouter usa ids con `/`; split por
 *    el PRIMER `/` → provider `openrouter`, modelId `anthropic/claude-3.5-sonnet`).
 */
@Injectable()
export class ModelGatewayService {
  private readonly providers: Map<string, ModelProvider>;

  constructor(
    anthropic: AnthropicModelProvider,
    openai: OpenAiModelProvider,
    openrouter: OpenRouterModelProvider,
    gemini: GeminiModelProvider,
  ) {
    this.providers = new Map<string, ModelProvider>([
      [anthropic.id, anthropic],
      [openai.id, openai],
      [openrouter.id, openrouter],
      [gemini.id, gemini],
    ]);
  }

  resolve(model: string): { provider: ModelProvider; modelId: string } {
    const idx = model.indexOf('/');
    if (idx === -1) {
      // Sin prefijo → asumimos Anthropic (Claude).
      return { provider: this.mustGet('anthropic'), modelId: model };
    }
    const providerId = model.slice(0, idx);
    const modelId = model.slice(idx + 1);
    return { provider: this.mustGet(providerId), modelId };
  }

  async generate(
    model: string,
    input: Omit<ModelGenerateInput, 'model'>,
  ): Promise<ModelGenerateResult> {
    const { provider, modelId } = this.resolve(model);
    return provider.generate({ ...input, model: modelId });
  }

  private mustGet(providerId: string): ModelProvider {
    const p = this.providers.get(providerId);
    if (!p) {
      throw new ModelProviderError(
        `Proveedor de modelo desconocido: "${providerId}" (soportados: ${[...this.providers.keys()].join(', ')})`,
        providerId,
      );
    }
    return p;
  }
}
