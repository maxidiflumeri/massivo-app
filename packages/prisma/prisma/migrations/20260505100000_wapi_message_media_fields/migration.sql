-- AlterTable
ALTER TABLE "WapiMessage" ADD COLUMN "mediaId" TEXT,
ADD COLUMN "mediaMime" TEXT,
ADD COLUMN "mediaSha256" TEXT,
ADD COLUMN "mediaSize" INTEGER,
ADD COLUMN "mediaFilename" TEXT,
ADD COLUMN "mediaCaption" TEXT,
ADD COLUMN "mediaLocalPath" TEXT;

-- CreateIndex
CREATE INDEX "WapiMessage_teamId_mediaSha256_idx" ON "WapiMessage"("teamId", "mediaSha256");
