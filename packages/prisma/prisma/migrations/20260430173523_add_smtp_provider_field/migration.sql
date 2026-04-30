-- AlterTable
ALTER TABLE "SmtpAccount" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'smtp',
ADD COLUMN     "sesConfigSet" TEXT;
