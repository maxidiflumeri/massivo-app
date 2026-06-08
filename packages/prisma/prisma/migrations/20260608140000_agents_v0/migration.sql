-- Plataforma agéntica (v0) — entidad `Agent` (runtime LLM) + ruteo de canal a agente.
-- Hand-written idempotente (convención del repo).

-- 1. Tabla Agent.
CREATE TABLE IF NOT EXISTS "Agent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT NOT NULL DEFAULT 'anthropic/claude-haiku-4-5-20251001',
  "systemPrompt" TEXT,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "maxSteps" INTEGER NOT NULL DEFAULT 6,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Agent_organizationId_idx" ON "Agent"("organizationId");
CREATE INDEX IF NOT EXISTS "Agent_teamId_idx" ON "Agent"("teamId");

-- 2. Ruteo de canal → agente.
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
CREATE INDEX IF NOT EXISTS "Channel_agentId_idx" ON "Channel"("agentId");

-- 3. FKs (guard pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_organizationId_fkey') THEN
    ALTER TABLE "Agent" ADD CONSTRAINT "Agent_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_teamId_fkey') THEN
    ALTER TABLE "Agent" ADD CONSTRAINT "Agent_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Channel_agentId_fkey') THEN
    ALTER TABLE "Channel" ADD CONSTRAINT "Channel_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
