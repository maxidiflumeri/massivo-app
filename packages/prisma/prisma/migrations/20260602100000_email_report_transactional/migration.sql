-- Soporte para EmailReport transaccional: envíos one-shot que no provienen
-- de una EmailCampaign con EmailContact, sino de un endpoint
-- POST /api/email/transactional. Para no romper queries existentes:
--   - campaignId/contactId pasan a nullable
--   - se agrega recipientEmail para guardar la dirección destino del
--     transaccional (en campañas viene de contact.email)
-- Las queries que filtran WHERE campaignId IS NOT NULL siguen ignorando
-- estos registros.

ALTER TABLE "EmailReport" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "EmailReport" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "EmailReport" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;

-- Índice para listar todos los transaccionales recientes por org sin
-- escanear la tabla campañas-pesada.
CREATE INDEX IF NOT EXISTS "EmailReport_org_sent_transactional_idx"
  ON "EmailReport" ("organizationId", "sentAt" DESC)
  WHERE "campaignId" IS NULL;
