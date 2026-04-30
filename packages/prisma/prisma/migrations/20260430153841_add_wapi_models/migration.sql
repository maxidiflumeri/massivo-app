-- CreateEnum
CREATE TYPE "WapiCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WapiReportStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WapiConversationStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WapiOptOutScope" AS ENUM ('GLOBAL', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "WapiConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "webhookVerifyTokenEnc" TEXT NOT NULL,
    "appSecretEnc" TEXT,
    "welcomeMessage" TEXT,
    "optOutConfirmMessage" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WapiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "metaName" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "buttonActions" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WapiCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "jobId" TEXT,
    "templateId" TEXT,
    "configId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "config" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WapiCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "status" "WapiReportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" "WapiConversationStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "window24hAt" TIMESTAMP(3),
    "firstReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "campaignName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WapiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "fromMe" BOOLEAN NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiOptOut" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "scope" "WapiOptOutScope" NOT NULL DEFAULT 'GLOBAL',
    "campaignId" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WapiConfig_organizationId_idx" ON "WapiConfig"("organizationId");

-- CreateIndex
CREATE INDEX "WapiConfig_teamId_idx" ON "WapiConfig"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WapiConfig_teamId_phoneNumberId_key" ON "WapiConfig"("teamId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "WapiTemplate_organizationId_idx" ON "WapiTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "WapiTemplate_teamId_idx" ON "WapiTemplate"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WapiTemplate_teamId_metaName_businessAccountId_key" ON "WapiTemplate"("teamId", "metaName", "businessAccountId");

-- CreateIndex
CREATE INDEX "WapiCampaign_organizationId_idx" ON "WapiCampaign"("organizationId");

-- CreateIndex
CREATE INDEX "WapiCampaign_teamId_idx" ON "WapiCampaign"("teamId");

-- CreateIndex
CREATE INDEX "WapiCampaign_teamId_status_idx" ON "WapiCampaign"("teamId", "status");

-- CreateIndex
CREATE INDEX "WapiContact_organizationId_idx" ON "WapiContact"("organizationId");

-- CreateIndex
CREATE INDEX "WapiContact_teamId_idx" ON "WapiContact"("teamId");

-- CreateIndex
CREATE INDEX "WapiContact_campaignId_idx" ON "WapiContact"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "WapiReport_contactId_key" ON "WapiReport"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WapiReport_metaMessageId_key" ON "WapiReport"("metaMessageId");

-- CreateIndex
CREATE INDEX "WapiReport_organizationId_idx" ON "WapiReport"("organizationId");

-- CreateIndex
CREATE INDEX "WapiReport_teamId_idx" ON "WapiReport"("teamId");

-- CreateIndex
CREATE INDEX "WapiReport_campaignId_idx" ON "WapiReport"("campaignId");

-- CreateIndex
CREATE INDEX "WapiReport_teamId_status_idx" ON "WapiReport"("teamId", "status");

-- CreateIndex
CREATE INDEX "WapiReport_sentAt_idx" ON "WapiReport"("sentAt");

-- CreateIndex
CREATE INDEX "WapiConversation_organizationId_idx" ON "WapiConversation"("organizationId");

-- CreateIndex
CREATE INDEX "WapiConversation_teamId_idx" ON "WapiConversation"("teamId");

-- CreateIndex
CREATE INDEX "WapiConversation_assignedUserId_idx" ON "WapiConversation"("assignedUserId");

-- CreateIndex
CREATE INDEX "WapiConversation_status_idx" ON "WapiConversation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WapiConversation_teamId_configId_phone_key" ON "WapiConversation"("teamId", "configId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WapiMessage_metaMessageId_key" ON "WapiMessage"("metaMessageId");

-- CreateIndex
CREATE INDEX "WapiMessage_organizationId_idx" ON "WapiMessage"("organizationId");

-- CreateIndex
CREATE INDEX "WapiMessage_teamId_idx" ON "WapiMessage"("teamId");

-- CreateIndex
CREATE INDEX "WapiMessage_conversationId_timestamp_idx" ON "WapiMessage"("conversationId", "timestamp");

-- CreateIndex
CREATE INDEX "WapiOptOut_organizationId_idx" ON "WapiOptOut"("organizationId");

-- CreateIndex
CREATE INDEX "WapiOptOut_teamId_phoneHash_idx" ON "WapiOptOut"("teamId", "phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "WapiOptOut_teamId_phoneHash_scope_campaignId_key" ON "WapiOptOut"("teamId", "phoneHash", "scope", "campaignId");

-- AddForeignKey
ALTER TABLE "WapiConfig" ADD CONSTRAINT "WapiConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiConfig" ADD CONSTRAINT "WapiConfig_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiTemplate" ADD CONSTRAINT "WapiTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiTemplate" ADD CONSTRAINT "WapiTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiCampaign" ADD CONSTRAINT "WapiCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiCampaign" ADD CONSTRAINT "WapiCampaign_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiCampaign" ADD CONSTRAINT "WapiCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WapiTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiCampaign" ADD CONSTRAINT "WapiCampaign_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WapiConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiContact" ADD CONSTRAINT "WapiContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiContact" ADD CONSTRAINT "WapiContact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiContact" ADD CONSTRAINT "WapiContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WapiCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiReport" ADD CONSTRAINT "WapiReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiReport" ADD CONSTRAINT "WapiReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiReport" ADD CONSTRAINT "WapiReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WapiCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiReport" ADD CONSTRAINT "WapiReport_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WapiContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiConversation" ADD CONSTRAINT "WapiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiConversation" ADD CONSTRAINT "WapiConversation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiConversation" ADD CONSTRAINT "WapiConversation_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WapiConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiMessage" ADD CONSTRAINT "WapiMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiMessage" ADD CONSTRAINT "WapiMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiMessage" ADD CONSTRAINT "WapiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WapiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiOptOut" ADD CONSTRAINT "WapiOptOut_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiOptOut" ADD CONSTRAINT "WapiOptOut_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
