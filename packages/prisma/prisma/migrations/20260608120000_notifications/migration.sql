-- Notificaciones del inbox (campanita del navbar). Tabla `Notification` + enum
-- `NotificationType`. Dos baldes: "Para mí" (userId con valor) y "Sin asignar"
-- (userId NULL). Hand-written idempotente (convención del repo).

-- 1. Enum NotificationType (guard pg_type).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('NEW_MESSAGE', 'ASSIGNED', 'UNASSIGNED_NEW', 'HANDOFF');
  END IF;
END $$;

-- 2. Tabla Notification.
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT,
  "conversationId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelKind" "ChannelType" NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT,
  "body" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- 3. Índices (nombres = los que deriva Prisma del modelo, para evitar drift).
CREATE INDEX IF NOT EXISTS "Notification_organizationId_idx" ON "Notification"("organizationId");
CREATE INDEX IF NOT EXISTS "Notification_teamId_idx" ON "Notification"("teamId");
CREATE INDEX IF NOT EXISTS "Notification_teamId_userId_readAt_createdAt_idx" ON "Notification"("teamId", "userId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_conversationId_idx" ON "Notification"("conversationId");

-- 4. FKs (guard pg_constraint) — cascade desde org/team/conversation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_organizationId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_teamId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_conversationId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
