-- AlterTable
ALTER TABLE "WapiConversation" ADD COLUMN "priority" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WapiConversation_teamId_priority_lastMessageAt_idx" ON "WapiConversation"("teamId", "priority", "lastMessageAt");
