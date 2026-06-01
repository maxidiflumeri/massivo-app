-- =============================================================================
-- Migration: Email Domains — Phase 1 (SES domain identities)
-- =============================================================================
-- Crea el modelo EmailDomain (org-scoped) para gestionar dominios verificados
-- en AWS SES. SmtpAccount gana un FK opcional emailDomainId. Plan.limits suma
-- la key dedicatedDomains (data update vía UPDATE jsonb, idempotente).
--
-- Idempotente: safe to re-run on partially-applied state (CREATE IF NOT EXISTS
-- donde aplica, UPDATE jsonb merge en Plan.limits).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CreateEnum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'TEMPORARY_FAILURE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. CreateTable: EmailDomain
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "EmailDomain" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "domain"          TEXT NOT NULL,
  "status"          "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
  "dkimTokens"      JSONB NOT NULL DEFAULT '[]',
  "lastCheckedAt"   TIMESTAMP(3),
  "verifiedAt"      TIMESTAMP(3),
  "failureReason"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDomain_organizationId_domain_key"
  ON "EmailDomain" ("organizationId", "domain");

CREATE INDEX IF NOT EXISTS "EmailDomain_organizationId_idx"
  ON "EmailDomain" ("organizationId");

CREATE INDEX IF NOT EXISTS "EmailDomain_status_idx"
  ON "EmailDomain" ("status");

-- FK Organization
DO $$ BEGIN
  ALTER TABLE "EmailDomain"
    ADD CONSTRAINT "EmailDomain_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 3. SmtpAccount: add emailDomainId
-- -----------------------------------------------------------------------------
ALTER TABLE "SmtpAccount" ADD COLUMN IF NOT EXISTS "emailDomainId" TEXT;

CREATE INDEX IF NOT EXISTS "SmtpAccount_emailDomainId_idx"
  ON "SmtpAccount" ("emailDomainId");

DO $$ BEGIN
  ALTER TABLE "SmtpAccount"
    ADD CONSTRAINT "SmtpAccount_emailDomainId_fkey"
    FOREIGN KEY ("emailDomainId") REFERENCES "EmailDomain"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Plan.limits: agregar dedicatedDomains a los 4 planes base (idempotente)
--
-- Usamos jsonb_set con `create_missing=true` (default) — si la key ya existe
-- no la pisamos. Si querés forzar overwrite, cambialo a false en una corrida
-- manual.
-- -----------------------------------------------------------------------------
UPDATE "Plan"
SET "limits" = jsonb_set("limits", '{dedicatedDomains}', '1'::jsonb, true)
WHERE "code" = 'FREE' AND NOT ("limits" ? 'dedicatedDomains');

UPDATE "Plan"
SET "limits" = jsonb_set("limits", '{dedicatedDomains}', '3'::jsonb, true)
WHERE "code" = 'STARTER' AND NOT ("limits" ? 'dedicatedDomains');

UPDATE "Plan"
SET "limits" = jsonb_set("limits", '{dedicatedDomains}', '10'::jsonb, true)
WHERE "code" = 'BUSINESS' AND NOT ("limits" ? 'dedicatedDomains');

UPDATE "Plan"
SET "limits" = jsonb_set("limits", '{dedicatedDomains}', '-1'::jsonb, true)
WHERE "code" = 'ENTERPRISE' AND NOT ("limits" ? 'dedicatedDomains');
