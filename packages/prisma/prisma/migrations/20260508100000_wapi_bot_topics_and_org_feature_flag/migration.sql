-- 4.O.1 — Multi-topic bot system + per-org feature flag.
-- Adds:
--   * Organization.botEnabled (per-org feature flag, default false)
--   * WapiConfig.botTopics + botRouter (multi-tema + reglas de ruteo)
--   * WapiBotSession.currentTopicId (en qué tema está la sesión)

ALTER TABLE "Organization"
  ADD COLUMN "botEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WapiConfig"
  ADD COLUMN "botTopics" JSONB,
  ADD COLUMN "botRouter" JSONB;

ALTER TABLE "WapiBotSession"
  ADD COLUMN "currentTopicId" TEXT;
