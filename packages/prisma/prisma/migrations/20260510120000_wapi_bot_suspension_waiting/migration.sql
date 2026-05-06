-- 4.O.6 — Bot suspension + estado WAITING.
--
-- Objetivo: el motor del bot deja de atender una conversación una vez que un
-- humano tomó cargo (HANDOFF, button INBOX action, take/assign). El bot sólo
-- vuelve a operar cuando el operador resuelve. Suma el estado WAITING para
-- "respondí, espero al cliente" con TTL automático.
--
-- Cambios:
-- 1. Enum: agregar valor WAITING.
-- 2. WapiConfig.botWaitingTtlMin: TTL configurable (default 120 min).
-- 3. WapiConversation: 4 columnas nuevas (escalated, botSuspended, waitingUntil, lastAssignedUserId).
-- 4. Backfill: marcar todas las conversaciones existentes como escalated=true
--    para no esconderlas del inbox de un día para el otro.
-- 5. Índices: filtro de inbox + worker de expiración.

ALTER TYPE "WapiConversationStatus" ADD VALUE 'WAITING';

ALTER TABLE "WapiConfig"
  ADD COLUMN "botWaitingTtlMin" INTEGER NOT NULL DEFAULT 120;

ALTER TABLE "WapiConversation"
  ADD COLUMN "escalated"          BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN "botSuspended"       BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN "waitingUntil"       TIMESTAMP(3),
  ADD COLUMN "lastAssignedUserId" TEXT;

-- Backfill: mantener visibilidad de las conversaciones pre-existentes.
UPDATE "WapiConversation" SET "escalated" = TRUE;

-- Índices nuevos.
CREATE INDEX "WapiConversation_teamId_escalated_lastMessageAt_idx"
  ON "WapiConversation"("teamId", "escalated", "lastMessageAt");
CREATE INDEX "WapiConversation_status_waitingUntil_idx"
  ON "WapiConversation"("status", "waitingUntil");
