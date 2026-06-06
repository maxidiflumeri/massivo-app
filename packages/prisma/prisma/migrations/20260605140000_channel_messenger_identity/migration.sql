-- Fase 2-A — Generalizar la identidad del Channel para canales Meta no-WhatsApp.
--
-- WhatsApp se identifica por `phoneNumberId`; Messenger/Instagram por `pageId`.
-- Se hace `phoneNumberId` nullable (un Channel Messenger no tiene número) y se
-- agrega `pageId` (nullable, WhatsApp no lo usa). Cada uno tiene su propio unique
-- por team; los NULLs no colisionan en Postgres, así que un Channel WhatsApp
-- (pageId NULL) y uno Messenger (phoneNumberId NULL) conviven sin chocar.
--
-- `businessAccountId` queda NOT NULL (WhatsApp-only, sin unique → los canales
-- no-WhatsApp guardan '' ). Hand-written idempotente.

-- phoneNumberId pasa a nullable.
ALTER TABLE "Channel" ALTER COLUMN "phoneNumberId" DROP NOT NULL;

-- Nueva columna pageId (Messenger/IG).
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "pageId" TEXT;

-- Unique por team para pageId (los WhatsApp con pageId NULL no colisionan).
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_teamId_pageId_key" ON "Channel"("teamId", "pageId");
