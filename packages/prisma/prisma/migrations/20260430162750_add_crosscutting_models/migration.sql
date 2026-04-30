-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('EMAIL', 'WAPI');

-- CreateEnum
CREATE TYPE "ScheduledTaskKind" AS ENUM ('EMAIL_DAILY_REPORT', 'CAMPAIGN_DISPATCH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "CampaignLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactListMember" (
    "listId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMember_pkey" PRIMARY KEY ("listId","contactId")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ScheduledTaskKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "config" JSONB NOT NULL,
    "recipients" JSONB,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "backoffMs" INTEGER NOT NULL DEFAULT 60000,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" "TaskExecutionStatus" NOT NULL,
    "error" TEXT,
    "artifacts" JSONB,
    "logs" JSONB,

    CONSTRAINT "TaskExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "channel" "ChannelKind" NOT NULL,
    "campaignId" TEXT NOT NULL,
    "level" "CampaignLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE INDEX "Contact_teamId_idx" ON "Contact"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_teamId_email_key" ON "Contact"("teamId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_teamId_phone_key" ON "Contact"("teamId", "phone");

-- CreateIndex
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");

-- CreateIndex
CREATE INDEX "Tag_teamId_idx" ON "Tag"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_teamId_name_key" ON "Tag"("teamId", "name");

-- CreateIndex
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- CreateIndex
CREATE INDEX "ContactList_organizationId_idx" ON "ContactList"("organizationId");

-- CreateIndex
CREATE INDEX "ContactList_teamId_idx" ON "ContactList"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactList_teamId_name_key" ON "ContactList"("teamId", "name");

-- CreateIndex
CREATE INDEX "ContactListMember_contactId_idx" ON "ContactListMember"("contactId");

-- CreateIndex
CREATE INDEX "ScheduledTask_organizationId_idx" ON "ScheduledTask"("organizationId");

-- CreateIndex
CREATE INDEX "ScheduledTask_teamId_idx" ON "ScheduledTask"("teamId");

-- CreateIndex
CREATE INDEX "ScheduledTask_nextRunAt_idx" ON "ScheduledTask"("nextRunAt");

-- CreateIndex
CREATE INDEX "TaskExecution_organizationId_idx" ON "TaskExecution"("organizationId");

-- CreateIndex
CREATE INDEX "TaskExecution_teamId_idx" ON "TaskExecution"("teamId");

-- CreateIndex
CREATE INDEX "TaskExecution_taskId_idx" ON "TaskExecution"("taskId");

-- CreateIndex
CREATE INDEX "TaskExecution_startedAt_idx" ON "TaskExecution"("startedAt");

-- CreateIndex
CREATE INDEX "CampaignLog_organizationId_idx" ON "CampaignLog"("organizationId");

-- CreateIndex
CREATE INDEX "CampaignLog_teamId_idx" ON "CampaignLog"("teamId");

-- CreateIndex
CREATE INDEX "CampaignLog_channel_campaignId_createdAt_idx" ON "CampaignLog"("channel", "campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
