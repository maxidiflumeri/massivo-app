import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIM, type EmbeddingInputType, type EmbeddingProvider } from './embedding-provider';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
/** Voyage acepta hasta 1000 inputs por request; usamos lotes chicos por límites de tokens. */
const BATCH = 100;

/** voyage-3.5-lite: buena relación calidad/costo, free tier generoso. 1024 dims (matchea la columna vector(1024)). */
export const VOYAGE_MODEL = 'voyage-3.5-lite';

/**
 * Proveedor de embeddings vía la API de Voyage AI. `input_type` distingue
 * `document` (al ingestar) de `query` (al buscar) → retrieval asimétrico, mejor
 * recall. Usa `fetch` nativo (sin SDK). La key sale de `VOYAGE_API_KEY`.
 */
@Injectable()
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'voyage';
  readonly model = VOYAGE_MODEL;
  readonly dimension = EMBEDDING_DIM;

  constructor(private readonly config: ConfigService) {}

  private key(): string {
    const k = this.config.get<string>('VOYAGE_API_KEY');
    if (!k) throw new ServiceUnavailableException('Falta VOYAGE_API_KEY para vectorizar');
    return k;
  }

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    if (texts.length === 0) return [];
    const key = this.key();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const resp = await fetch(VOYAGE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: batch,
          model: this.model,
          input_type: inputType,
          output_dimension: this.dimension,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Voyage ${resp.status}: ${body.slice(0, 300)}`);
      }
      const json = (await resp.json()) as { data: Array<{ index: number; embedding: number[] }> };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      out.push(...sorted.map((d) => d.embedding));
    }
    return out;
  }

  async embedOne(text: string, inputType: EmbeddingInputType): Promise<number[]> {
    const [v] = await this.embed([text], inputType);
    if (!v) throw new Error('Voyage no devolvió un embedding');
    return v;
  }
}
