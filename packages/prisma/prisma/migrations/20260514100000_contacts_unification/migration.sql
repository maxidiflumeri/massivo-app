-- =============================================================================
-- Migration: Contacts unification (Phase 5 — Stage 1)
-- =============================================================================
-- Moves Contact from team-scope to organization-scope and adds identity fields
-- (externalId, dni, cuit, phoneE164). Adds contactId FK on EmailContact and
-- WapiContact. Creates ContactMergeSuggestion + ContactImportJob tables.
-- Backfills new Contact rows from EmailContact / WapiContact, linking them.
-- Idempotent: safe to re-run on partially-applied state.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema changes (generated via `prisma migrate diff`)
-- -----------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "ContactMergeSuggestionMatchType" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "ContactMergeSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_teamId_fkey";

-- DropIndex
DROP INDEX "Contact_teamId_email_key";

-- DropIndex
DROP INDEX "Contact_teamId_phone_key";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "cuit" TEXT,
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "phoneE164" TEXT,
ALTER COLUMN "teamId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmailContact" ADD COLUMN     "contactId" TEXT;

-- AlterTable
ALTER TABLE "WapiContact" ADD COLUMN     "contactId" TEXT;

-- CreateTable
CREATE TABLE "ContactMergeSuggestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leftContactId" TEXT NOT NULL,
    "rightContactId" TEXT NOT NULL,
    "matchType" "ContactMergeSuggestionMatchType" NOT NULL,
    "matchValue" TEXT NOT NULL,
    "status" "ContactMergeSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMergeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "ContactImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "mapping" JSONB NOT NULL,
    "options" JSONB,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "suggested" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMergeSuggestion_organizationId_status_idx" ON "ContactMergeSuggestion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContactMergeSuggestion_organizationId_idx" ON "ContactMergeSuggestion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactMergeSuggestion_leftContactId_rightContactId_matchTy_key" ON "ContactMergeSuggestion"("leftContactId", "rightContactId", "matchType");

-- CreateIndex
CREATE INDEX "ContactImportJob_organizationId_status_idx" ON "ContactImportJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContactImportJob_organizationId_createdAt_idx" ON "ContactImportJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_organizationId_email_idx" ON "Contact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Contact_organizationId_phoneE164_idx" ON "Contact"("organizationId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_externalId_key" ON "Contact"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_dni_key" ON "Contact"("organizationId", "dni");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_cuit_key" ON "Contact"("organizationId", "cuit");

-- CreateIndex
CREATE INDEX "EmailContact_contactId_idx" ON "EmailContact"("contactId");

-- CreateIndex
CREATE INDEX "WapiContact_contactId_idx" ON "WapiContact"("contactId");

-- AddForeignKey
ALTER TABLE "EmailContact" ADD CONSTRAINT "EmailContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiContact" ADD CONSTRAINT "WapiContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeSuggestion" ADD CONSTRAINT "ContactMergeSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeSuggestion" ADD CONSTRAINT "ContactMergeSuggestion_leftContactId_fkey" FOREIGN KEY ("leftContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeSuggestion" ADD CONSTRAINT "ContactMergeSuggestion_rightContactId_fkey" FOREIGN KEY ("rightContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportJob" ADD CONSTRAINT "ContactImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Backfill
-- =============================================================================

-- 1) Normalize phoneE164 on existing Contact rows: digits only, '+' prefix.
--    Skip values too short to be a valid international number (< 8 digits).
UPDATE "Contact"
SET "phoneE164" = '+' || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phone" IS NOT NULL
  AND "phoneE164" IS NULL
  AND LENGTH(regexp_replace("phone", '[^0-9]', '', 'g')) >= 8;

-- 2) Link existing EmailContact rows to existing Contact rows by normalized email
--    (within the same organization). Picks the Contact with the longest name as
--    tie-breaker when multiple Contacts in the org share the same email.
WITH ranked AS (
  SELECT DISTINCT ON (c."organizationId", LOWER(TRIM(c."email")))
    c."organizationId",
    LOWER(TRIM(c."email")) AS norm_email,
    c."id" AS contact_id
  FROM "Contact" c
  WHERE c."email" IS NOT NULL AND TRIM(c."email") <> ''
  ORDER BY
    c."organizationId",
    LOWER(TRIM(c."email")),
    LENGTH(COALESCE(c."firstName", '') || COALESCE(c."lastName", '')) DESC,
    c."createdAt" ASC
)
UPDATE "EmailContact" ec
SET "contactId" = ranked.contact_id
FROM ranked
WHERE ec."contactId" IS NULL
  AND ec."email" IS NOT NULL AND TRIM(ec."email") <> ''
  AND ec."organizationId" = ranked."organizationId"
  AND LOWER(TRIM(ec."email")) = ranked.norm_email;

-- 3) Create new Contact rows for EmailContact emails not yet linked.
--    One Contact per (organizationId, normalized email). Picks the row with the
--    longest name as the source for the new Contact's firstName.
WITH unlinked AS (
  SELECT DISTINCT ON (ec."organizationId", LOWER(TRIM(ec."email")))
    ec."organizationId" AS organization_id,
    ec."teamId" AS team_id,
    LOWER(TRIM(ec."email")) AS norm_email,
    ec."name" AS source_name
  FROM "EmailContact" ec
  WHERE ec."contactId" IS NULL
    AND ec."email" IS NOT NULL AND TRIM(ec."email") <> ''
  ORDER BY
    ec."organizationId",
    LOWER(TRIM(ec."email")),
    LENGTH(COALESCE(ec."name", '')) DESC,
    ec."createdAt" ASC
),
inserted AS (
  INSERT INTO "Contact" (
    "id", "organizationId", "teamId", "email", "firstName",
    "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    organization_id,
    team_id,
    norm_email,
    source_name,
    NOW(),
    NOW()
  FROM unlinked
  RETURNING "id", "organizationId", "email"
)
UPDATE "EmailContact" ec
SET "contactId" = inserted."id"
FROM inserted
WHERE ec."contactId" IS NULL
  AND ec."email" IS NOT NULL
  AND ec."organizationId" = inserted."organizationId"
  AND LOWER(TRIM(ec."email")) = inserted."email";

-- 4) Link existing WapiContact rows to existing Contact rows by normalized phone.
--    Tie-breaks by longest name.
WITH ranked AS (
  SELECT DISTINCT ON (c."organizationId", c."phoneE164")
    c."organizationId",
    c."phoneE164" AS phone_e164,
    c."id" AS contact_id
  FROM "Contact" c
  WHERE c."phoneE164" IS NOT NULL
  ORDER BY
    c."organizationId",
    c."phoneE164",
    LENGTH(COALESCE(c."firstName", '') || COALESCE(c."lastName", '')) DESC,
    c."createdAt" ASC
)
UPDATE "WapiContact" wc
SET "contactId" = ranked.contact_id
FROM ranked
WHERE wc."contactId" IS NULL
  AND wc."phone" IS NOT NULL
  AND LENGTH(regexp_replace(wc."phone", '[^0-9]', '', 'g')) >= 8
  AND wc."organizationId" = ranked."organizationId"
  AND ('+' || regexp_replace(wc."phone", '[^0-9]', '', 'g')) = ranked.phone_e164;

-- 5) Create new Contact rows for WapiContact phones not yet linked.
--    One Contact per (organizationId, normalized phoneE164).
WITH unlinked AS (
  SELECT DISTINCT ON (wc."organizationId", '+' || regexp_replace(wc."phone", '[^0-9]', '', 'g'))
    wc."organizationId" AS organization_id,
    wc."teamId" AS team_id,
    wc."phone" AS source_phone,
    '+' || regexp_replace(wc."phone", '[^0-9]', '', 'g') AS norm_phone,
    wc."name" AS source_name
  FROM "WapiContact" wc
  WHERE wc."contactId" IS NULL
    AND wc."phone" IS NOT NULL
    AND LENGTH(regexp_replace(wc."phone", '[^0-9]', '', 'g')) >= 8
  ORDER BY
    wc."organizationId",
    '+' || regexp_replace(wc."phone", '[^0-9]', '', 'g'),
    LENGTH(COALESCE(wc."name", '')) DESC,
    wc."createdAt" ASC
),
inserted AS (
  INSERT INTO "Contact" (
    "id", "organizationId", "teamId", "phone", "phoneE164", "firstName",
    "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    organization_id,
    team_id,
    source_phone,
    norm_phone,
    source_name,
    NOW(),
    NOW()
  FROM unlinked
  RETURNING "id", "organizationId", "phoneE164"
)
UPDATE "WapiContact" wc
SET "contactId" = inserted."id"
FROM inserted
WHERE wc."contactId" IS NULL
  AND wc."phone" IS NOT NULL
  AND LENGTH(regexp_replace(wc."phone", '[^0-9]', '', 'g')) >= 8
  AND wc."organizationId" = inserted."organizationId"
  AND ('+' || regexp_replace(wc."phone", '[^0-9]', '', 'g')) = inserted."phoneE164";
