-- =============================================================================
-- Migration: Email Domain DNS verification (SPF + DMARC)
-- =============================================================================
-- Agrega tracking de SPF y DMARC al EmailDomain. El backend hace lookup TXT
-- vía node:dns/promises sobre `<domain>` (SPF) y `_dmarc.<domain>` (DMARC),
-- y guarda status + record crudo para mostrar al user.
--
-- Idempotente.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "DnsRecordStatus" AS ENUM ('PENDING', 'VERIFIED', 'MISSING', 'INVALID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "EmailDomain" ADD COLUMN IF NOT EXISTS "spfStatus" "DnsRecordStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "EmailDomain" ADD COLUMN IF NOT EXISTS "spfRecord" TEXT;
ALTER TABLE "EmailDomain" ADD COLUMN IF NOT EXISTS "dmarcStatus" "DnsRecordStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "EmailDomain" ADD COLUMN IF NOT EXISTS "dmarcRecord" TEXT;
ALTER TABLE "EmailDomain" ADD COLUMN IF NOT EXISTS "dnsLastCheckedAt" TIMESTAMP(3);
