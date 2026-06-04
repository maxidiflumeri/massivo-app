-- =============================================================================
-- Migration: Extract Bot entity (Phase 0a — multi-canal)
-- =============================================================================
-- Saca la definición del bot de las columnas `bot*` de `WapiConfig` a una entidad
-- propia `Bot`. Un Bot se diseña una vez y se conecta a N canales (hoy N
-- WapiConfig vía `WapiConfig.botId`).
--
-- Las columnas `bot*` de `WapiConfig` SE MANTIENEN (deprecadas) para migración
-- reversible — se dropean en el cleanup de Fase 0c. `botWaitingTtlMin` se queda en
-- WapiConfig (es TTL de "hold" del inbox, no definición de bot).
--
-- Backfill: 1 Bot por WapiConfig con datos de bot. Id derivado del config id
-- ('bot_' || config.id) para que el linking config↔bot sea idempotente.
-- Idempotente: seguro de re-correr (ON CONFLICT DO NOTHING + WHERE botId IS NULL).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema changes
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "flow" JSONB,
    "topics" JSONB,
    "router" JSONB,
    "variables" JSONB,
    "topicsDraft" JSONB,
    "routerDraft" JSONB,
    "variablesDraft" JSONB,
    "draftUpdatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sessionTtlMin" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bot_organizationId_idx" ON "Bot"("organizationId");
CREATE INDEX "Bot_teamId_idx" ON "Bot"("teamId");

-- AlterTable
ALTER TABLE "WapiConfig" ADD COLUMN "botId" TEXT;

-- CreateIndex
CREATE INDEX "WapiConfig_botId_idx" ON "WapiConfig"("botId");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WapiConfig" ADD CONSTRAINT "WapiConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Backfill: crear un Bot por cada WapiConfig que tenga definición de bot.
-- -----------------------------------------------------------------------------

INSERT INTO "Bot" (
    "id", "organizationId", "teamId", "name", "enabled",
    "flow", "topics", "router", "variables",
    "topicsDraft", "routerDraft", "variablesDraft",
    "draftUpdatedAt", "publishedAt", "sessionTtlMin",
    "createdAt", "updatedAt"
)
SELECT
    'bot_' || c."id",
    c."organizationId",
    c."teamId",
    COALESCE(NULLIF(c."name", ''), 'Bot ' || c."phoneNumberId"),
    c."botEnabled",
    c."botFlow", c."botTopics", c."botRouter", c."botVariables",
    c."botTopicsDraft", c."botRouterDraft", c."botVariablesDraft",
    c."botDraftUpdatedAt", c."botPublishedAt",
    c."botSessionTtlMin",
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "WapiConfig" c
WHERE c."botId" IS NULL
  AND (
        c."botFlow" IS NOT NULL
     OR c."botTopics" IS NOT NULL
     OR c."botRouter" IS NOT NULL
     OR c."botVariables" IS NOT NULL
     OR c."botTopicsDraft" IS NOT NULL
     OR c."botRouterDraft" IS NOT NULL
     OR c."botVariablesDraft" IS NOT NULL
     OR c."botEnabled" = true
  )
ON CONFLICT ("id") DO NOTHING;

-- Linkear cada config a su Bot recién creado.
UPDATE "WapiConfig" c
SET "botId" = 'bot_' || c."id"
WHERE c."botId" IS NULL
  AND EXISTS (SELECT 1 FROM "Bot" b WHERE b."id" = 'bot_' || c."id");
