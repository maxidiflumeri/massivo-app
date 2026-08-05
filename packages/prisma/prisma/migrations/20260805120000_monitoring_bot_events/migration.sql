-- CreateTable
CREATE TABLE "BotEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channelId" TEXT,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "nodeId" TEXT,
    "nodeKind" TEXT,
    "topicId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotEvent_conversationId_createdAt_idx" ON "BotEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "BotEvent_teamId_createdAt_idx" ON "BotEvent"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "BotEvent_createdAt_idx" ON "BotEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_teamId_createdAt_idx" ON "Conversation"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_teamId_timestamp_idx" ON "Message"("teamId", "timestamp");

-- AddForeignKey
ALTER TABLE "BotEvent" ADD CONSTRAINT "BotEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotEvent" ADD CONSTRAINT "BotEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

