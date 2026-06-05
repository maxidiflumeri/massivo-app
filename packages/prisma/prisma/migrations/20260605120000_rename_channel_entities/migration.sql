-- =============================================================================
-- Migration: Rename Wapi* → Channel/Conversation/Message/BotSession (Fase 1d)
-- =============================================================================
-- Unifica el modelo de datos multi-canal. RENAME (no DROP) → preserva los datos
-- existentes (greenfield/POC: pocas filas). Idempotente: seguro de re-correr.
--
--   WapiConfig       → Channel        (+ columna `kind` ChannelType)
--   WapiConversation → Conversation   (configId→channelId, phone→externalUserId,
--                                       window24hAt→freeformWindowAt, +channelKind)
--   WapiMessage      → Message        (metaMessageId→externalId, +channelId denorm,
--                                       unique global → unique [channelId, externalId])
--   WapiBotSession   → BotSession     (configId→channelId, phone→externalUserId)
--   WapiCampaign.configId → channelId
--
-- Las clases del backend (WapiBot*Service) y el enum WapiConversationStatus NO se
-- renombran acá (van en 1g). El enum nuevo se llama `ChannelType` porque ya existe
-- un `ChannelKind { EMAIL, WAPI }` legacy (CampaignLog) con otra semántica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Enum nuevo
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelType') THEN
    CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'WEBCHAT');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Rename de tablas
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS "WapiConfig" RENAME TO "Channel";
ALTER TABLE IF EXISTS "WapiConversation" RENAME TO "Conversation";
ALTER TABLE IF EXISTS "WapiMessage" RENAME TO "Message";
ALTER TABLE IF EXISTS "WapiBotSession" RENAME TO "BotSession";

-- -----------------------------------------------------------------------------
-- 3) Rename de columnas
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Conversation' AND column_name='configId') THEN
    ALTER TABLE "Conversation" RENAME COLUMN "configId" TO "channelId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Conversation' AND column_name='phone') THEN
    ALTER TABLE "Conversation" RENAME COLUMN "phone" TO "externalUserId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Conversation' AND column_name='window24hAt') THEN
    ALTER TABLE "Conversation" RENAME COLUMN "window24hAt" TO "freeformWindowAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BotSession' AND column_name='configId') THEN
    ALTER TABLE "BotSession" RENAME COLUMN "configId" TO "channelId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='BotSession' AND column_name='phone') THEN
    ALTER TABLE "BotSession" RENAME COLUMN "phone" TO "externalUserId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Message' AND column_name='metaMessageId') THEN
    ALTER TABLE "Message" RENAME COLUMN "metaMessageId" TO "externalId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='WapiCampaign' AND column_name='configId') THEN
    ALTER TABLE "WapiCampaign" RENAME COLUMN "configId" TO "channelId";
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Columnas nuevas (nullable primero para poder backfillear)
-- -----------------------------------------------------------------------------
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "kind" "ChannelType" NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "channelKind" "ChannelType";
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "channelId" TEXT;

-- -----------------------------------------------------------------------------
-- 5) Backfill de denormalizados
-- -----------------------------------------------------------------------------
UPDATE "Conversation" c SET "channelKind" = ch."kind"
FROM "Channel" ch WHERE c."channelId" = ch."id" AND c."channelKind" IS NULL;

UPDATE "Message" m SET "channelId" = c."channelId"
FROM "Conversation" c WHERE m."conversationId" = c."id" AND m."channelId" IS NULL;

-- 6) SET NOT NULL (greenfield: el backfill cubre todas las filas vía FK)
ALTER TABLE "Conversation" ALTER COLUMN "channelKind" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "channelId" SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 7) Renombrar PK/FK constraints a los nombres que Prisma deriva del modelo nuevo
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  -- PKs
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConfig_pkey') THEN ALTER TABLE "Channel" RENAME CONSTRAINT "WapiConfig_pkey" TO "Channel_pkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConversation_pkey') THEN ALTER TABLE "Conversation" RENAME CONSTRAINT "WapiConversation_pkey" TO "Conversation_pkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiMessage_pkey') THEN ALTER TABLE "Message" RENAME CONSTRAINT "WapiMessage_pkey" TO "Message_pkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiBotSession_pkey') THEN ALTER TABLE "BotSession" RENAME CONSTRAINT "WapiBotSession_pkey" TO "BotSession_pkey"; END IF;

  -- FKs Channel
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConfig_organizationId_fkey') THEN ALTER TABLE "Channel" RENAME CONSTRAINT "WapiConfig_organizationId_fkey" TO "Channel_organizationId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConfig_teamId_fkey') THEN ALTER TABLE "Channel" RENAME CONSTRAINT "WapiConfig_teamId_fkey" TO "Channel_teamId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConfig_botId_fkey') THEN ALTER TABLE "Channel" RENAME CONSTRAINT "WapiConfig_botId_fkey" TO "Channel_botId_fkey"; END IF;

  -- FKs Conversation
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConversation_organizationId_fkey') THEN ALTER TABLE "Conversation" RENAME CONSTRAINT "WapiConversation_organizationId_fkey" TO "Conversation_organizationId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConversation_teamId_fkey') THEN ALTER TABLE "Conversation" RENAME CONSTRAINT "WapiConversation_teamId_fkey" TO "Conversation_teamId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiConversation_configId_fkey') THEN ALTER TABLE "Conversation" RENAME CONSTRAINT "WapiConversation_configId_fkey" TO "Conversation_channelId_fkey"; END IF;

  -- FKs Message
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiMessage_organizationId_fkey') THEN ALTER TABLE "Message" RENAME CONSTRAINT "WapiMessage_organizationId_fkey" TO "Message_organizationId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiMessage_teamId_fkey') THEN ALTER TABLE "Message" RENAME CONSTRAINT "WapiMessage_teamId_fkey" TO "Message_teamId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiMessage_conversationId_fkey') THEN ALTER TABLE "Message" RENAME CONSTRAINT "WapiMessage_conversationId_fkey" TO "Message_conversationId_fkey"; END IF;

  -- FKs BotSession
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiBotSession_organizationId_fkey') THEN ALTER TABLE "BotSession" RENAME CONSTRAINT "WapiBotSession_organizationId_fkey" TO "BotSession_organizationId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiBotSession_teamId_fkey') THEN ALTER TABLE "BotSession" RENAME CONSTRAINT "WapiBotSession_teamId_fkey" TO "BotSession_teamId_fkey"; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiBotSession_configId_fkey') THEN ALTER TABLE "BotSession" RENAME CONSTRAINT "WapiBotSession_configId_fkey" TO "BotSession_channelId_fkey"; END IF;

  -- FK WapiCampaign.channelId
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WapiCampaign_configId_fkey') THEN ALTER TABLE "WapiCampaign" RENAME CONSTRAINT "WapiCampaign_configId_fkey" TO "WapiCampaign_channelId_fkey"; END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8) Renombrar índices (incluye uniques `_key`) a los nombres que Prisma espera
-- -----------------------------------------------------------------------------
-- Channel
ALTER INDEX IF EXISTS "WapiConfig_teamId_phoneNumberId_key" RENAME TO "Channel_teamId_phoneNumberId_key";
ALTER INDEX IF EXISTS "WapiConfig_organizationId_idx" RENAME TO "Channel_organizationId_idx";
ALTER INDEX IF EXISTS "WapiConfig_teamId_idx" RENAME TO "Channel_teamId_idx";
ALTER INDEX IF EXISTS "WapiConfig_botId_idx" RENAME TO "Channel_botId_idx";

-- Conversation
ALTER INDEX IF EXISTS "WapiConversation_teamId_configId_phone_key" RENAME TO "Conversation_teamId_channelId_externalUserId_key";
ALTER INDEX IF EXISTS "WapiConversation_organizationId_idx" RENAME TO "Conversation_organizationId_idx";
ALTER INDEX IF EXISTS "WapiConversation_teamId_idx" RENAME TO "Conversation_teamId_idx";
ALTER INDEX IF EXISTS "WapiConversation_assignedUserId_idx" RENAME TO "Conversation_assignedUserId_idx";
ALTER INDEX IF EXISTS "WapiConversation_status_idx" RENAME TO "Conversation_status_idx";
ALTER INDEX IF EXISTS "WapiConversation_teamId_status_lastMessageAt_idx" RENAME TO "Conversation_teamId_status_lastMessageAt_idx";
ALTER INDEX IF EXISTS "WapiConversation_teamId_priority_lastMessageAt_idx" RENAME TO "Conversation_teamId_priority_lastMessageAt_idx";
ALTER INDEX IF EXISTS "WapiConversation_teamId_escalated_lastMessageAt_idx" RENAME TO "Conversation_teamId_escalated_lastMessageAt_idx";
ALTER INDEX IF EXISTS "WapiConversation_status_waitingUntil_idx" RENAME TO "Conversation_status_waitingUntil_idx";

-- Message
ALTER INDEX IF EXISTS "WapiMessage_organizationId_idx" RENAME TO "Message_organizationId_idx";
ALTER INDEX IF EXISTS "WapiMessage_teamId_idx" RENAME TO "Message_teamId_idx";
ALTER INDEX IF EXISTS "WapiMessage_conversationId_timestamp_idx" RENAME TO "Message_conversationId_timestamp_idx";
ALTER INDEX IF EXISTS "WapiMessage_teamId_mediaSha256_idx" RENAME TO "Message_teamId_mediaSha256_idx";

-- BotSession
ALTER INDEX IF EXISTS "WapiBotSession_configId_phone_key" RENAME TO "BotSession_channelId_externalUserId_key";
ALTER INDEX IF EXISTS "WapiBotSession_organizationId_idx" RENAME TO "BotSession_organizationId_idx";
ALTER INDEX IF EXISTS "WapiBotSession_teamId_idx" RENAME TO "BotSession_teamId_idx";
ALTER INDEX IF EXISTS "WapiBotSession_expiresAt_idx" RENAME TO "BotSession_expiresAt_idx";

-- -----------------------------------------------------------------------------
-- 9) Unique de Message: global (metaMessageId) → compuesto [channelId, externalId]
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS "WapiMessage_metaMessageId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Message_channelId_externalId_key" ON "Message"("channelId", "externalId");

-- -----------------------------------------------------------------------------
-- 10) Índice nuevo para el filtro de inbox por canal
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Conversation_teamId_channelKind_lastMessageAt_idx" ON "Conversation"("teamId", "channelKind", "lastMessageAt");
