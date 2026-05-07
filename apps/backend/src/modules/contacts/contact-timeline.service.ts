import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { GetTimelineQueryDto } from './contact-timeline.dto';

export type TimelineChannel = 'email' | 'wapi' | 'audit';

export type TimelineKind =
  | 'email.queued'
  | 'email.sent'
  | 'email.failed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.suppressed'
  | 'email.canceled'
  | 'email.opened'
  | 'email.clicked'
  | 'wapi.queued'
  | 'wapi.sent'
  | 'wapi.delivered'
  | 'wapi.read'
  | 'wapi.failed'
  | 'wapi.canceled'
  | 'wapi.message.in'
  | 'wapi.message.out'
  | 'audit';

export interface TimelineItem {
  id: string;
  at: Date;
  channel: TimelineChannel;
  kind: TimelineKind;
  refId: string;
  metadata: Record<string, unknown>;
}

export interface TimelinePage {
  items: TimelineItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const PER_SOURCE_BUFFER = 200;

const EMAIL_STATUS_KIND: Record<string, TimelineKind> = {
  PENDING: 'email.queued',
  SENT: 'email.sent',
  FAILED: 'email.failed',
  BOUNCED: 'email.bounced',
  COMPLAINED: 'email.complained',
  SUPPRESSED: 'email.suppressed',
  CANCELED: 'email.canceled',
};

@Injectable()
export class ContactTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(contactId: string, query: GetTimelineQueryDto): Promise<TimelinePage> {
    this.requireContext();

    const contact = await this.prisma.scoped.contact.findFirst({
      where: { id: contactId },
      select: { id: true, email: true, phoneE164: true, phone: true },
    });
    if (!contact) throw new NotFoundException('Contact no encontrado');

    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : DEFAULT_LIMIT;
    const cursorDate = query.cursor ? new Date(query.cursor) : null;
    if (cursorDate && Number.isNaN(cursorDate.getTime())) {
      throw new BadRequestException('cursor inválido');
    }
    const channel = query.channel;

    const items: TimelineItem[] = [];

    if (!channel || channel === 'email') {
      items.push(...(await this.collectEmail(contactId, cursorDate)));
    }
    if (!channel || channel === 'wapi') {
      items.push(...(await this.collectWapi(contactId, contact.phoneE164, cursorDate)));
    }
    if (!channel || channel === 'audit') {
      items.push(...(await this.collectAudit(contactId, cursorDate)));
    }

    items.sort((a, b) => {
      const diff = b.at.getTime() - a.at.getTime();
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });

    const sliced = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextCursor =
      hasMore && sliced.length > 0 ? sliced[sliced.length - 1]!.at.toISOString() : null;

    return { items: sliced, nextCursor };
  }

  private async collectEmail(
    contactId: string,
    cursorDate: Date | null,
  ): Promise<TimelineItem[]> {
    const emailContacts = await this.prisma.scoped.emailContact.findMany({
      where: { contactId },
      select: { id: true },
    });
    const emailContactIds = emailContacts.map((c) => c.id);
    if (emailContactIds.length === 0) return [];

    const cursorClause = cursorDate
      ? {
          OR: [
            { sentAt: { lte: cursorDate } },
            { sentAt: null, createdAt: { lte: cursorDate } },
          ],
        }
      : {};

    const reports = await this.prisma.scoped.emailReport.findMany({
      where: {
        contactId: { in: emailContactIds },
        ...cursorClause,
      },
      include: {
        campaign: { select: { id: true, name: true } },
      },
      take: PER_SOURCE_BUFFER,
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    });

    const out: TimelineItem[] = [];
    const reportIds: string[] = [];

    for (const r of reports) {
      const at = r.sentAt ?? r.createdAt;
      if (cursorDate && at > cursorDate) continue;
      reportIds.push(r.id);
      const kind = EMAIL_STATUS_KIND[r.status] ?? 'email.queued';
      out.push({
        id: `email.report.${r.id}`,
        at,
        channel: 'email',
        kind,
        refId: r.id,
        metadata: {
          campaignId: r.campaignId,
          campaignName: r.campaign?.name ?? null,
          subject: r.subject ?? null,
          error: r.error ?? null,
        },
      });
    }

    if (reportIds.length === 0) return out;

    const events = await this.prisma.scoped.emailEvent.findMany({
      where: {
        reportId: { in: reportIds },
        ...(cursorDate ? { occurredAt: { lte: cursorDate } } : {}),
      },
      take: PER_SOURCE_BUFFER,
      orderBy: { occurredAt: 'desc' },
    });

    for (const e of events) {
      out.push({
        id: `email.event.${e.id}`,
        at: e.occurredAt,
        channel: 'email',
        kind: e.type === 'OPEN' ? 'email.opened' : 'email.clicked',
        refId: e.id,
        metadata: {
          reportId: e.reportId,
          targetUrl: e.targetUrl ?? null,
          targetDomain: e.targetDomain ?? null,
          ip: e.ip ?? null,
          deviceFamily: e.deviceFamily ?? null,
        },
      });
    }

    return out;
  }

  private async collectWapi(
    contactId: string,
    phoneE164: string | null,
    cursorDate: Date | null,
  ): Promise<TimelineItem[]> {
    const wapiContacts = await this.prisma.scoped.wapiContact.findMany({
      where: { contactId },
      select: { id: true, phone: true },
    });
    const wapiContactIds = wapiContacts.map((c) => c.id);

    const out: TimelineItem[] = [];

    if (wapiContactIds.length > 0) {
      const reports = await this.prisma.scoped.wapiReport.findMany({
        where: { contactId: { in: wapiContactIds } },
        include: { campaign: { select: { id: true, name: true } } },
        take: PER_SOURCE_BUFFER,
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      });

      for (const r of reports) {
        const baseMeta = {
          campaignId: r.campaignId,
          campaignName: r.campaign?.name ?? null,
        };
        if (r.failedAt && (!cursorDate || r.failedAt <= cursorDate)) {
          out.push({
            id: `wapi.report.${r.id}.failed`,
            at: r.failedAt,
            channel: 'wapi',
            kind: 'wapi.failed',
            refId: r.id,
            metadata: { ...baseMeta, error: r.error ?? null },
          });
        }
        if (r.readAt && (!cursorDate || r.readAt <= cursorDate)) {
          out.push({
            id: `wapi.report.${r.id}.read`,
            at: r.readAt,
            channel: 'wapi',
            kind: 'wapi.read',
            refId: r.id,
            metadata: baseMeta,
          });
        }
        if (r.deliveredAt && (!cursorDate || r.deliveredAt <= cursorDate)) {
          out.push({
            id: `wapi.report.${r.id}.delivered`,
            at: r.deliveredAt,
            channel: 'wapi',
            kind: 'wapi.delivered',
            refId: r.id,
            metadata: baseMeta,
          });
        }
        if (r.sentAt && (!cursorDate || r.sentAt <= cursorDate)) {
          out.push({
            id: `wapi.report.${r.id}.sent`,
            at: r.sentAt,
            channel: 'wapi',
            kind: 'wapi.sent',
            refId: r.id,
            metadata: baseMeta,
          });
        }
      }
    }

    const phones = new Set<string>();
    if (phoneE164) phones.add(phoneE164);
    for (const wc of wapiContacts) {
      if (wc.phone) phones.add(wc.phone);
    }

    if (phones.size > 0) {
      const conversations = await this.prisma.scoped.wapiConversation.findMany({
        where: { phone: { in: [...phones] } },
        select: { id: true },
      });
      const convIds = conversations.map((c) => c.id);
      if (convIds.length > 0) {
        const messages = await this.prisma.scoped.wapiMessage.findMany({
          where: {
            conversationId: { in: convIds },
            ...(cursorDate ? { timestamp: { lte: cursorDate } } : {}),
          },
          take: PER_SOURCE_BUFFER,
          orderBy: { timestamp: 'desc' },
        });
        for (const m of messages) {
          out.push({
            id: `wapi.message.${m.id}`,
            at: m.timestamp,
            channel: 'wapi',
            kind: m.fromMe ? 'wapi.message.out' : 'wapi.message.in',
            refId: m.id,
            metadata: {
              conversationId: m.conversationId,
              type: m.type,
              status: m.status,
              mediaMime: m.mediaMime ?? null,
              mediaCaption: m.mediaCaption ?? null,
            },
          });
        }
      }
    }

    return out;
  }

  private async collectAudit(
    contactId: string,
    cursorDate: Date | null,
  ): Promise<TimelineItem[]> {
    const audits = await this.prisma.scoped.auditLog.findMany({
      where: {
        resourceType: 'Contact',
        resourceId: contactId,
        ...(cursorDate ? { createdAt: { lte: cursorDate } } : {}),
      },
      take: PER_SOURCE_BUFFER,
      orderBy: { createdAt: 'desc' },
    });

    return audits.map((a) => ({
      id: `audit.${a.id}`,
      at: a.createdAt,
      channel: 'audit' as const,
      kind: 'audit' as const,
      refId: a.id,
      metadata: {
        action: a.action,
        actorUserId: a.actorUserId,
        ip: a.ip,
        userAgent: a.userAgent,
        details: a.metadata ?? null,
      },
    }));
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
