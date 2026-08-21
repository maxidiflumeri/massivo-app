-- AlterTable
ALTER TABLE "BotEvent" ADD COLUMN     "runId" TEXT;

-- CreateIndex
CREATE INDEX "BotEvent_runId_idx" ON "BotEvent"("runId");

