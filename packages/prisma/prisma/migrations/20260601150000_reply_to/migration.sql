-- =============================================================================
-- Migration: Reply-To configurable per SmtpAccount + EmailCampaign
-- =============================================================================
-- Agrega `replyTo` (TEXT NULL) a SmtpAccount (default per-account) y
-- EmailCampaign (override per-campaign). Worker resuelve campaign → account
-- → null y pasa al sender como `ReplyToAddresses`/nodemailer `replyTo`.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE "SmtpAccount" ADD COLUMN IF NOT EXISTS "replyTo" TEXT;
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "replyTo" TEXT;
