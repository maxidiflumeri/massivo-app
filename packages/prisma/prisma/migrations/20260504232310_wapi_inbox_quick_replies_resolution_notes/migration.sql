-- CreateTable
CREATE TABLE "WapiQuickReply" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WapiQuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WapiResolutionNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WapiResolutionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WapiQuickReply_organizationId_idx" ON "WapiQuickReply"("organizationId");

-- CreateIndex
CREATE INDEX "WapiQuickReply_teamId_idx" ON "WapiQuickReply"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WapiQuickReply_teamId_shortcut_key" ON "WapiQuickReply"("teamId", "shortcut");

-- CreateIndex
CREATE INDEX "WapiResolutionNote_organizationId_idx" ON "WapiResolutionNote"("organizationId");

-- CreateIndex
CREATE INDEX "WapiResolutionNote_teamId_idx" ON "WapiResolutionNote"("teamId");

-- CreateIndex
CREATE INDEX "WapiResolutionNote_conversationId_createdAt_idx" ON "WapiResolutionNote"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WapiConversation_teamId_status_lastMessageAt_idx" ON "WapiConversation"("teamId", "status", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "WapiQuickReply" ADD CONSTRAINT "WapiQuickReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiQuickReply" ADD CONSTRAINT "WapiQuickReply_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiResolutionNote" ADD CONSTRAINT "WapiResolutionNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiResolutionNote" ADD CONSTRAINT "WapiResolutionNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WapiResolutionNote" ADD CONSTRAINT "WapiResolutionNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WapiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
