-- RAG de agentes IA — base de conocimiento vectorizada (pgvector + Voyage).
-- Hand-written idempotente (convención del repo).

-- 1. Extensión pgvector (disponible en la imagen pgvector/pgvector:pg15 y en RDS).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Enums (guard pg_type).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentDocumentSource') THEN
    CREATE TYPE "AgentDocumentSource" AS ENUM ('TEXT', 'FILE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentDocumentStatus') THEN
    CREATE TYPE "AgentDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
  END IF;
END $$;

-- 3. Tabla AgentDocument.
CREATE TABLE IF NOT EXISTS "AgentDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" "AgentDocumentSource" NOT NULL DEFAULT 'TEXT',
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "status" "AgentDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentDocument_organizationId_idx" ON "AgentDocument"("organizationId");
CREATE INDEX IF NOT EXISTS "AgentDocument_teamId_idx" ON "AgentDocument"("teamId");
CREATE INDEX IF NOT EXISTS "AgentDocument_agentId_idx" ON "AgentDocument"("agentId");

-- 4. Tabla AgentChunk. La columna `embedding` es pgvector(1024); Prisma la trata
--    como Unsupported → insert/select vía $queryRaw. Sin índice ANN por ahora
--    (búsqueda exacta; OK para KBs chicas, se agrega HNSW cuando escale).
CREATE TABLE IF NOT EXISTS "AgentChunk" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentChunk_agentId_idx" ON "AgentChunk"("agentId");
CREATE INDEX IF NOT EXISTS "AgentChunk_documentId_idx" ON "AgentChunk"("documentId");

-- 5. FKs (guard pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentDocument_organizationId_fkey') THEN
    ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentDocument_teamId_fkey') THEN
    ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentDocument_agentId_fkey') THEN
    ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentChunk_documentId_fkey') THEN
    ALTER TABLE "AgentChunk" ADD CONSTRAINT "AgentChunk_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "AgentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
