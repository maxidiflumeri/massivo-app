/**
 * Contrato del proveedor de embeddings del RAG (mismo patrón que EmailSender
 * smtp|ses y ModelGatewayService). Se elige por env `EMBEDDING_PROVIDER`
 * (default "voyage") en la factory de AgentsModule; los servicios inyectan el
 * token EMBEDDING_PROVIDER sin conocer la implementación.
 */

/** Token de inyección de NestJS para el proveedor activo. */
export const EMBEDDING_PROVIDER = Symbol('EmbeddingProvider');

/**
 * Dimensión de la columna `AgentChunk.embedding` (`vector(1024)`). Todo
 * proveedor debe producir vectores de esta dimensión; cambiarla implica
 * migración de la columna + re-embeber lo ingestado (embeddings de modelos
 * distintos no son comparables entre sí).
 */
export const EMBEDDING_DIM = 1024;

/**
 * `document` al ingestar, `query` al buscar → retrieval asimétrico, mejor
 * recall. Cada proveedor lo traduce a su mecanismo (Voyage: `input_type`;
 * modelos e5 locales: prefijos "passage: " / "query: ").
 */
export type EmbeddingInputType = 'document' | 'query';

export interface EmbeddingProvider {
  /** Id corto del proveedor, matchea el valor del env (ej. "voyage"). */
  readonly id: string;
  /** Modelo de embeddings que usa (para logs/diagnóstico). */
  readonly model: string;
  /** Dimensión de los vectores que produce. Debe ser EMBEDDING_DIM. */
  readonly dimension: number;

  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
  embedOne(text: string, inputType: EmbeddingInputType): Promise<number[]>;
}
