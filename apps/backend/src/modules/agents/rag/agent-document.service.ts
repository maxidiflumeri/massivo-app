import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { VoyageEmbeddingProvider } from './voyage-embedding.provider';
import { chunkText } from './text-chunker';

/** Tope defensivo de texto por documento (v0, ingesta síncrona). */
const MAX_TEXT_CHARS = 500_000;

export interface AgentDocumentDto {
  id: string;
  name: string;
  source: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const DOC_SELECT = {
  id: true,
  name: true,
  source: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  error: true,
  chunkCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Gestión de los documentos de conocimiento (RAG) de un Agente. CRUD tenant-scoped
 * (`prisma.scoped`) + ingesta: extrae texto → chunking → embeddings (Voyage) →
 * persiste los `AgentChunk` con su vector vía SQL raw (la columna `vector` es
 * Unsupported en Prisma). Ingesta síncrona en v0 (docs chicos); el `status` refleja
 * PROCESSING/READY/FAILED para la UI.
 */
@Injectable()
export class AgentDocumentService {
  private readonly logger = new Logger(AgentDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voyage: VoyageEmbeddingProvider,
  ) {}

  private ctx() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('Sin contexto de tenant');
    return ctx;
  }

  async list(agentId: string): Promise<AgentDocumentDto[]> {
    await this.assertAgent(agentId);
    const rows = await this.prisma.scoped.agentDocument.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      select: DOC_SELECT,
    });
    return rows as unknown as AgentDocumentDto[];
  }

  async addText(agentId: string, name: string, text: string): Promise<AgentDocumentDto> {
    const clean = (text ?? '').trim();
    if (!clean) throw new BadRequestException('El texto está vacío');
    if (clean.length > MAX_TEXT_CHARS) {
      throw new BadRequestException(`El texto supera el máximo (${MAX_TEXT_CHARS} caracteres)`);
    }
    return this.ingest(agentId, name?.trim() || 'Texto', 'TEXT', null, clean.length, clean);
  }

  async addFile(agentId: string, file: Express.Multer.File | undefined): Promise<AgentDocumentDto> {
    if (!file) throw new BadRequestException('Falta el archivo');
    const text = extractText(file);
    return this.ingest(agentId, file.originalname || 'Archivo', 'FILE', file.mimetype ?? null, file.size, text);
  }

  async remove(agentId: string, documentId: string): Promise<{ id: string }> {
    await this.assertAgent(agentId);
    const doc = await this.prisma.scoped.agentDocument.findFirst({
      where: { id: documentId, agentId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException(`Documento ${documentId} no encontrado`);
    // Los AgentChunk caen por onDelete: Cascade.
    await this.prisma.scoped.agentDocument.delete({ where: { id: documentId } });
    return { id: documentId };
  }

  /** Crea el doc, lo vectoriza y persiste los chunks. Síncrono (v0). */
  private async ingest(
    agentId: string,
    name: string,
    source: 'TEXT' | 'FILE',
    mimeType: string | null,
    sizeBytes: number,
    text: string,
  ): Promise<AgentDocumentDto> {
    const ctx = this.ctx();
    await this.assertAgent(agentId);
    const created = (await this.prisma.scoped.agentDocument.create({
      data: {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        agentId,
        name,
        source,
        mimeType,
        sizeBytes,
        status: 'PROCESSING',
      } as never,
      select: DOC_SELECT,
    })) as unknown as AgentDocumentDto;

    try {
      const chunks = chunkText(text);
      if (chunks.length === 0) throw new Error('No se pudo extraer texto del documento');
      const embeddings = await this.voyage.embed(
        chunks.map((c) => c.content),
        'document',
      );
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        if (!chunk || !embedding) continue;
        const vec = `[${embedding.join(',')}]`;
        await this.prisma.$executeRaw`
          INSERT INTO "AgentChunk" ("id", "organizationId", "teamId", "agentId", "documentId", "index", "content", "embedding")
          VALUES (gen_random_uuid()::text, ${ctx.organizationId}, ${ctx.teamId}, ${agentId}, ${created.id}, ${chunk.index}, ${chunk.content}, ${vec}::vector)
        `;
      }
      const updated = (await this.prisma.scoped.agentDocument.update({
        where: { id: created.id },
        data: { status: 'READY', chunkCount: chunks.length } as never,
        select: DOC_SELECT,
      })) as unknown as AgentDocumentDto;
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`ingesta falló doc=${created.id}: ${msg}`);
      return (await this.prisma.scoped.agentDocument.update({
        where: { id: created.id },
        data: { status: 'FAILED', error: msg.slice(0, 500) } as never,
        select: DOC_SELECT,
      })) as unknown as AgentDocumentDto;
    }
  }

  private async assertAgent(agentId: string): Promise<void> {
    const a = await this.prisma.scoped.agent.findFirst({ where: { id: agentId }, select: { id: true } });
    if (!a) throw new NotFoundException(`Agente ${agentId} no encontrado`);
  }
}

/** Extrae texto plano de un archivo subido. v0: solo formatos de texto (PDF próximamente). */
function extractText(file: Express.Multer.File): string {
  const mime = file.mimetype || '';
  const name = (file.originalname || '').toLowerCase();
  const isText =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|md|markdown|csv|json|log|html?|xml|yaml|yml)$/.test(name);
  if (!isText) {
    throw new BadRequestException(
      `Tipo de archivo no soportado todavía: ${mime || name}. Por ahora: txt, md, csv, json, html (PDF próximamente).`,
    );
  }
  return file.buffer.toString('utf8');
}
