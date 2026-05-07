import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@massivo/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../auth/tenant-context';

const SENSITIVE_KEY_PATTERN =
  /access[_-]?token|app[_-]?secret|verify[_-]?token|password|secret|api[_-]?key|enc$/i;
const REDACTED = '[REDACTED]';

export interface AuditLogEntry {
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  organizationId?: string;
  teamId?: string | null;
  actorUserId?: string | null;
}

/**
 * 4.S.1 — Service global para registrar transacciones de usuario en `AuditLog`.
 * Cross-tenant: usa `prisma` directo (no `scoped`) porque siempre setea
 * `organizationId` explícitamente desde el contexto o el override.
 *
 * Filosofía: fire-and-forget. Si falla la escritura, loggea warning y vuelve —
 * auditar nunca debe romper la acción del usuario.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const ctx = TenantContext.current();
      const organizationId = entry.organizationId ?? ctx?.organizationId;
      if (!organizationId) {
        this.logger.warn(
          `audit log "${entry.action}" descartado: sin organizationId (override ni contexto)`,
        );
        return;
      }
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          teamId: entry.teamId !== undefined ? entry.teamId : (ctx?.teamId ?? null),
          actorUserId:
            entry.actorUserId !== undefined ? entry.actorUserId : (ctx?.userId ?? null),
          action: entry.action,
          resourceType: entry.resourceType ?? null,
          resourceId: entry.resourceId ?? null,
          metadata: entry.metadata
            ? (sanitize(entry.metadata) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `audit log "${entry.action}" falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Recorre metadata y reemplaza valores de keys sensibles por `[REDACTED]`.
 * No muta el input; devuelve una copia profunda (limitada a JSON-serializable).
 */
export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}
