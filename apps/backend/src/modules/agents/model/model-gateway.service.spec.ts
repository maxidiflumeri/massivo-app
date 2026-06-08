import { ModelGatewayService } from './model-gateway.service';
import { ModelProviderError } from './model-types';

describe('ModelGatewayService', () => {
  const anthropic = { id: 'anthropic', generate: jest.fn() } as never;
  const openai = { id: 'openai', generate: jest.fn() } as never;
  const openrouter = { id: 'openrouter', generate: jest.fn() } as never;
  const gw = new ModelGatewayService(anthropic, openai, openrouter);

  it('resuelve provider/model', () => {
    const r = gw.resolve('anthropic/claude-haiku-4-5-20251001');
    expect(r.provider.id).toBe('anthropic');
    expect(r.modelId).toBe('claude-haiku-4-5-20251001');
  });

  it('OpenRouter conserva el slash del modelId (split por el primer /)', () => {
    const r = gw.resolve('openrouter/anthropic/claude-3.5-sonnet');
    expect(r.provider.id).toBe('openrouter');
    expect(r.modelId).toBe('anthropic/claude-3.5-sonnet');
  });

  it('sin prefijo → asume anthropic', () => {
    const r = gw.resolve('claude-x');
    expect(r.provider.id).toBe('anthropic');
    expect(r.modelId).toBe('claude-x');
  });

  it('proveedor desconocido → ModelProviderError', () => {
    expect(() => gw.resolve('foo/bar')).toThrow(ModelProviderError);
  });
});
