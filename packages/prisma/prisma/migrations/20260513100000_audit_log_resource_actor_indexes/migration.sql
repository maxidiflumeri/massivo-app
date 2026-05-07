-- 4.S.1: índices nuevos en AuditLog para consultas de "historial de un recurso"
-- y "actividad de un usuario". Aditiva, sin riesgo.

CREATE INDEX "AuditLog_organizationId_resourceType_resourceId_idx"
  ON "AuditLog"("organizationId", "resourceType", "resourceId");

CREATE INDEX "AuditLog_actorUserId_createdAt_idx"
  ON "AuditLog"("actorUserId", "createdAt");
