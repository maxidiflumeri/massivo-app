import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ListAuditLogsParams {
  cursor?: string;
  limit?: number;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditLogActor {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  teamId: string | null;
  createdAt: Date;
  actor: AuditLogActor | null;
}

export interface AuditLogPage {
  items: AuditLogRow[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListAuditLogsParams): Promise<AuditLogPage> {
    const limit = clampLimit(params.limit);
    const where: Record<string, unknown> = {};
    if (params.actorUserId) where.actorUserId = params.actorUserId;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;
    if (params.action) where.action = params.action;

    const createdAt: Record<string, Date> = {};
    if (params.from) createdAt.gte = new Date(params.from);
    if (params.to) createdAt.lte = new Date(params.to);
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    const rows = await this.prisma.scoped.auditLog.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        teamId: true,
        createdAt: true,
        actorUserId: true,
      },
    });

    const actorIds = Array.from(
      new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v)),
    );
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const enriched: AuditLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      teamId: r.teamId,
      createdAt: r.createdAt,
      actor: r.actorUserId ? (actorMap.get(r.actorUserId) ?? null) : null,
    }));

    if (enriched.length > limit) {
      const items = enriched.slice(0, limit);
      return { items, nextCursor: items[items.length - 1]!.id };
    }
    return { items: enriched, nextCursor: null };
  }
}

function clampLimit(raw?: number): number {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 1), 200);
}
