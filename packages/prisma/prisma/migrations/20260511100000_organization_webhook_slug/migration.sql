-- 4.P: webhook URL por organización (org-scoped)
-- Slug opaco: 'wbh_' + 22 chars hex derivados de md5(random+id+clock).
-- Nuevas orgs reciben slug generado en backend con crypto.randomBytes(18).toString('base64url').

ALTER TABLE "Organization" ADD COLUMN "webhookSlug" TEXT;

UPDATE "Organization"
SET "webhookSlug" = 'wbh_' || substr(
  md5(random()::text || clock_timestamp()::text || id) ||
  md5(random()::text || id),
  1,
  22
);

ALTER TABLE "Organization" ALTER COLUMN "webhookSlug" SET NOT NULL;

CREATE UNIQUE INDEX "Organization_webhookSlug_key" ON "Organization"("webhookSlug");
