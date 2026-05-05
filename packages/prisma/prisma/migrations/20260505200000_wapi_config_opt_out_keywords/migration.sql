-- AlterTable
ALTER TABLE "WapiConfig" ADD COLUMN "optOutKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
