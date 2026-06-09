import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { VoyageEmbeddingProvider } from './voyage-embedding.provider';

const DEFAULT_TOP_K = 5;
/** Distancia coseno máxima para considerar relevante un chunk (0 = idéntico, 2 = opuesto). */
const DEFAULT_MAX_DISTANCE = 0.6;

/**
 * Retrieval de la base de conocimiento (RAG) de un Agente. Embebe la query (Voyage,
 * `input_type=query`) y busca los chunks más cercanos por distancia coseno con
 * pgvector (`<=>`). Corre en contexto de sistema (cliente raw `prisma`), filtrando
 * por `agentId` + `organizationId` explícitos. Fail-open: ante cualquier problema
 * devuelve [] y el agente responde igual (sin contexto).
 */
@Injectable()
export class AgentRetrievalService {
  private readonly logger = new Logger(AgentRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voyage: VoyageEmbeddingProvider,
  ) {}

  async retrieve(
    agentId: string,
    organizationId: string,
    query: string,
    opts?: { topK?: number; maxDistance?: number },
  ): Promise<string[]> {
    const q = (query ?? '').trim();
    if (!agentId || !q) return [];

    // Existencia de KB: evita gastar un embedding si el agente no tiene documentos.
    const exists = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "AgentChunk" WHERE "agentId" = ${agentId}) AS "exists"
    `;
    if (!exists[0]?.exists) return [];

    let vec: string;
    try {
      const emb = await this.voyage.embedOne(q, 'query');
      vec = `[${emb.join(',')}]`;
    } catch (err) {
      this.logger.warn(
        `embedding de query falló agent=${agentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }

    const topK = opts?.topK ?? DEFAULT_TOP_K;
    const maxDistance = opts?.maxDistance ?? DEFAULT_MAX_DISTANCE;
    const rows = await this.prisma.$queryRaw<Array<{ content: string; distance: number }>>`
      SELECT "content", ("embedding" <=> ${vec}::vector) AS distance
      FROM "AgentChunk"
      WHERE "agentId" = ${agentId} AND "organizationId" = ${organizationId}
      ORDER BY distance ASC
      LIMIT ${topK}
    `;
    return rows.filter((r) => Number(r.distance) <= maxDistance).map((r) => r.content);
  }
}
