-- 4.O.3 — Sistema de Draft/Publish para bots.
-- botTopicsDraft / botRouterDraft guardan el "borrador" en edición.
-- botTopics / botRouter siguen siendo la versión publicada (la que ejecuta el motor en prod).
-- botDraftUpdatedAt: timestamp del último save del borrador (para detectar cambios sin publicar).
-- botPublishedAt: timestamp del último publish a producción.
ALTER TABLE "WapiConfig"
  ADD COLUMN "botTopicsDraft"     JSONB,
  ADD COLUMN "botRouterDraft"     JSONB,
  ADD COLUMN "botDraftUpdatedAt"  TIMESTAMP(3),
  ADD COLUMN "botPublishedAt"     TIMESTAMP(3);
