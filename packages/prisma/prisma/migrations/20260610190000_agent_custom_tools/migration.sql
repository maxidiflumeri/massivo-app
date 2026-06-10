-- Tools personalizadas de agentes IA (Slice 1): definición declarativa para el
-- LLM + acción HTTP ejecutada por BotHttpExecutor. m2m agente↔tool.

CREATE TYPE "AgentCustomToolType" AS ENUM ('HTTP');

CREATE TABLE "AgentCustomTool" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "AgentCustomToolType" NOT NULL DEFAULT 'HTTP',
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "bodyTemplate" JSONB,
    "timeoutMs" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCustomTool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCustomTool_teamId_name_key" ON "AgentCustomTool"("teamId", "name");
CREATE INDEX "AgentCustomTool_organizationId_idx" ON "AgentCustomTool"("organizationId");
CREATE INDEX "AgentCustomTool_teamId_idx" ON "AgentCustomTool"("teamId");

ALTER TABLE "AgentCustomTool" ADD CONSTRAINT "AgentCustomTool_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCustomTool" ADD CONSTRAINT "AgentCustomTool_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentCustomToolLink" (
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCustomToolLink_pkey" PRIMARY KEY ("agentId", "toolId")
);

CREATE INDEX "AgentCustomToolLink_toolId_idx" ON "AgentCustomToolLink"("toolId");

ALTER TABLE "AgentCustomToolLink" ADD CONSTRAINT "AgentCustomToolLink_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCustomToolLink" ADD CONSTRAINT "AgentCustomToolLink_toolId_fkey"
    FOREIGN KEY ("toolId") REFERENCES "AgentCustomTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
