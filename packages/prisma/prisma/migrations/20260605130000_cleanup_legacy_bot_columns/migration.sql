-- Fase 1f — Cleanup legacy.
--
-- (a) Drop de las columnas `bot*` deprecadas de Channel (ex WapiConfig). Quedaron
--     deprecadas en Fase 0a cuando la definición del bot pasó a la entidad `Bot`.
--     Ningún código las lee (la fuente de verdad es `Bot`, resuelto vía
--     Channel.botId; el webhook/sandbox arman CfgForEngine desde la relación
--     `bot`). Se mantenían para migración reversible; acá se dropean.
--     `botWaitingTtlMin` y `botId` se MANTIENEN (en uso: TTL del "hold" del inbox
--     y FK al bot).
-- (b) Rename del enum WapiConversationStatus → ConversationStatus (la Conversation
--     dejó de ser Wapi-específica en 1d; ningún código TS lo usa como tipo).
--
-- Hand-written idempotente (convención del repo).

-- (a) Drop columnas bot* deprecadas de Channel.
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botEnabled";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botFlow";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botSessionTtlMin";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botTopics";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botRouter";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botTopicsDraft";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botRouterDraft";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botVariables";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botVariablesDraft";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botDraftUpdatedAt";
ALTER TABLE "Channel" DROP COLUMN IF EXISTS "botPublishedAt";

-- (b) Rename enum WapiConversationStatus → ConversationStatus. Idempotente: sólo
--     si el viejo existe y el nuevo no. ALTER TYPE RENAME conserva los valores y
--     actualiza automáticamente las columnas que lo referencian (Conversation.status)
--     y su default.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WapiConversationStatus')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationStatus') THEN
    ALTER TYPE "WapiConversationStatus" RENAME TO "ConversationStatus";
  END IF;
END $$;
