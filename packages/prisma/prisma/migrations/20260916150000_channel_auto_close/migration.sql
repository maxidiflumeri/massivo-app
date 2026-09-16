-- Cierre por inactividad de conversaciones del lado humano (vuelven al bot).
ALTER TABLE "Channel" ADD COLUMN "autoCloseAfterMin" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Channel" ADD COLUMN "autoCloseMessage" TEXT;
