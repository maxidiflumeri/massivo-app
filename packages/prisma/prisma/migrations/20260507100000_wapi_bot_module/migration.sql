-- AlterTable
ALTER TABLE "WapiConfig" ADD COLUMN "botEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WapiConfig" ADD COLUMN "botFlow" JSONB;
ALTER TABLE "WapiConfig" ADD COLUMN "botSessionTtlMin" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "WapiBotSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "currentNodeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "WapiBotSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WapiBotSession_configId_phone_key" ON "WapiBotSession"("configId", "phone");
CREATE INDEX "WapiBotSession_organizationId_idx" ON "WapiBotSession"("organizationId");
CREATE INDEX "WapiBotSession_teamId_idx" ON "WapiBotSession"("teamId");
CREATE INDEX "WapiBotSession_expiresAt_idx" ON "WapiBotSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "WapiBotSession" ADD CONSTRAINT "WapiBotSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WapiBotSession" ADD CONSTRAINT "WapiBotSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WapiBotSession" ADD CONSTRAINT "WapiBotSession_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WapiConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
