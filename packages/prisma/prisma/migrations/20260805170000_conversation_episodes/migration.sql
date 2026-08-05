-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "currentEpisodeId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "episodeId" TEXT;

-- CreateIndex
CREATE INDEX "Message_conversationId_episodeId_idx" ON "Message"("conversationId", "episodeId");

-- CreateIndex
CREATE INDEX "Message_teamId_episodeId_idx" ON "Message"("teamId", "episodeId");


-- Backfill: reparte los mensajes históricos en "visitas" con la misma regla que
-- usará el runtime (corte por más de 30 min de silencio dentro de cada hilo).
-- Determinista y sin dependencias: se puede recalcular corriendo esto de nuevo.
WITH marcado AS (
  SELECT id, "conversationId", timestamp,
         CASE
           WHEN lag(timestamp) OVER w IS NULL
             OR timestamp - lag(timestamp) OVER w > interval '30 minutes'
           THEN 1 ELSE 0
         END AS abre
  FROM "Message"
  WINDOW w AS (PARTITION BY "conversationId" ORDER BY timestamp, id)
), numerado AS (
  SELECT id, "conversationId",
         sum(abre) OVER (PARTITION BY "conversationId" ORDER BY timestamp, id) AS n
  FROM marcado
)
UPDATE "Message" m
SET "episodeId" = 'ep_' || numerado."conversationId" || '_' || lpad(numerado.n::text, 4, '0')
FROM numerado
WHERE numerado.id = m.id AND m."episodeId" IS NULL;

-- La visita abierta de cada hilo = la del último mensaje.
UPDATE "Conversation" c
SET "currentEpisodeId" = ult."episodeId"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "episodeId"
  FROM "Message"
  ORDER BY "conversationId", timestamp DESC, id DESC
) AS ult
WHERE ult."conversationId" = c.id AND c."currentEpisodeId" IS NULL;
