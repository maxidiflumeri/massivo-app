import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactTimelineService } from './contact-timeline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

const tenantA: RequestContext = {
  userId: 'user-1',
  organizationId: 'org-a',
  teamId: 'team-a1',
  orgRole: 'OWNER',
  teamRole: 'ADMIN',
};

describe('ContactTimelineService', () => {
  let service: ContactTimelineService;
  let mocks: {
    contact: Record<string, jest.Mock>;
    emailContact: Record<string, jest.Mock>;
    emailReport: Record<string, jest.Mock>;
    emailEvent: Record<string, jest.Mock>;
    wapiContact: Record<string, jest.Mock>;
    wapiReport: Record<string, jest.Mock>;
    conversation: Record<string, jest.Mock>;
    message: Record<string, jest.Mock>;
    auditLog: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    mocks = {
      contact: { findFirst: jest.fn() },
      emailContact: { findMany: jest.fn().mockResolvedValue([]) },
      emailReport: { findMany: jest.fn().mockResolvedValue([]) },
      emailEvent: { findMany: jest.fn().mockResolvedValue([]) },
      wapiContact: { findMany: jest.fn().mockResolvedValue([]) },
      wapiReport: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactTimelineService,
        { provide: PrismaService, useValue: { scoped: mocks } },
      ],
    }).compile();
    service = moduleRef.get(ContactTimelineService);
  });

  it('contacto inexistente → NotFound', async () => {
    mocks.contact.findFirst!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.getTimeline('x', {})),
    ).rejects.toThrow(NotFoundException);
  });

  it('cursor inválido → BadRequest', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: null, phoneE164: null, phone: null });
    await expect(
      TenantContext.run(tenantA, () => service.getTimeline('c-1', { cursor: 'not-a-date' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('agrega email reports + events ordenados desc', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: 'foo@bar.com', phoneE164: null, phone: null });
    mocks.emailContact.findMany!.mockResolvedValue([{ id: 'ec-1' }]);
    mocks.emailReport.findMany!.mockResolvedValue([
      {
        id: 'r-1',
        status: 'SENT',
        sentAt: new Date('2026-05-01T10:00:00Z'),
        createdAt: new Date('2026-05-01T09:55:00Z'),
        contactId: 'ec-1',
        campaignId: 'camp-1',
        campaign: { id: 'camp-1', name: 'Camp 1' },
        subject: 'Hola',
        error: null,
      },
    ]);
    mocks.emailEvent.findMany!.mockResolvedValue([
      {
        id: 'ev-1',
        reportId: 'r-1',
        type: 'OPEN',
        occurredAt: new Date('2026-05-01T11:00:00Z'),
        targetUrl: null,
        targetDomain: null,
        ip: '1.1.1.1',
        deviceFamily: 'iPhone',
      },
      {
        id: 'ev-2',
        reportId: 'r-1',
        type: 'CLICK',
        occurredAt: new Date('2026-05-01T11:30:00Z'),
        targetUrl: 'https://x.com',
        targetDomain: 'x.com',
        ip: null,
        deviceFamily: null,
      },
    ]);

    const result = await TenantContext.run(tenantA, () => service.getTimeline('c-1', {}));
    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.kind).toBe('email.clicked');
    expect(result.items[1]!.kind).toBe('email.opened');
    expect(result.items[2]!.kind).toBe('email.sent');
    expect(result.nextCursor).toBeNull();
  });

  it('expande WapiReport en hasta 4 entries por status timestamps', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: null, phoneE164: '+5491111', phone: null });
    mocks.wapiContact.findMany!.mockResolvedValue([{ id: 'wc-1', phone: '+5491111' }]);
    mocks.wapiReport.findMany!.mockResolvedValue([
      {
        id: 'wr-1',
        contactId: 'wc-1',
        campaignId: 'wcamp-1',
        campaign: { id: 'wcamp-1', name: 'Wapi Camp' },
        sentAt: new Date('2026-05-01T10:00:00Z'),
        deliveredAt: new Date('2026-05-01T10:01:00Z'),
        readAt: new Date('2026-05-01T10:05:00Z'),
        failedAt: null,
        createdAt: new Date('2026-05-01T09:59:00Z'),
        error: null,
      },
    ]);
    mocks.conversation.findMany!.mockResolvedValue([{ id: 'conv-1' }]);
    mocks.message.findMany!.mockResolvedValue([
      {
        id: 'm-1',
        conversationId: 'conv-1',
        fromMe: false,
        type: 'text',
        status: 'received',
        timestamp: new Date('2026-05-01T12:00:00Z'),
        mediaMime: null,
        mediaCaption: null,
      },
    ]);

    const result = await TenantContext.run(tenantA, () => service.getTimeline('c-1', {}));
    const kinds = result.items.map((i) => i.kind);
    expect(kinds).toContain('wapi.sent');
    expect(kinds).toContain('wapi.delivered');
    expect(kinds).toContain('wapi.read');
    expect(kinds).not.toContain('wapi.failed');
    expect(kinds[0]).toBe('wapi.message.in');
  });

  it('canal=audit limita la query a AuditLog', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: null, phoneE164: null, phone: null });
    mocks.auditLog.findMany!.mockResolvedValue([
      {
        id: 'a-1',
        action: 'contact.updated',
        actorUserId: 'user-1',
        ip: null,
        userAgent: null,
        metadata: { from: { firstName: 'X' }, to: { firstName: 'Y' } },
        createdAt: new Date('2026-05-01T08:00:00Z'),
      },
    ]);

    const result = await TenantContext.run(tenantA, () =>
      service.getTimeline('c-1', { channel: 'audit' }),
    );
    expect(mocks.emailContact.findMany).not.toHaveBeenCalled();
    expect(mocks.wapiContact.findMany).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.kind).toBe('audit');
    expect((result.items[0]!.metadata as { action: string }).action).toBe('contact.updated');
  });

  it('limit + nextCursor cuando hay más items que el límite', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: null, phoneE164: null, phone: null });
    mocks.auditLog.findMany!.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `a-${i}`,
        action: 'contact.updated',
        actorUserId: 'user-1',
        ip: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date(Date.UTC(2026, 4, 1, 12 - i)),
      })),
    );

    const result = await TenantContext.run(tenantA, () =>
      service.getTimeline('c-1', { channel: 'audit', limit: 5 }),
    );
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe(result.items[4]!.at.toISOString());
  });

  it('cursor descarta items posteriores al cursor', async () => {
    mocks.contact.findFirst!.mockResolvedValue({ id: 'c-1', email: 'foo@bar.com', phoneE164: null, phone: null });
    mocks.emailContact.findMany!.mockResolvedValue([{ id: 'ec-1' }]);
    mocks.emailReport.findMany!.mockResolvedValue([
      {
        id: 'r-late',
        status: 'SENT',
        sentAt: new Date('2026-05-02T10:00:00Z'),
        createdAt: new Date('2026-05-02T09:00:00Z'),
        contactId: 'ec-1',
        campaignId: 'camp-1',
        campaign: { id: 'camp-1', name: 'C1' },
        subject: null,
        error: null,
      },
      {
        id: 'r-early',
        status: 'SENT',
        sentAt: new Date('2026-04-28T10:00:00Z'),
        createdAt: new Date('2026-04-28T09:00:00Z'),
        contactId: 'ec-1',
        campaignId: 'camp-1',
        campaign: { id: 'camp-1', name: 'C1' },
        subject: null,
        error: null,
      },
    ]);

    const result = await TenantContext.run(tenantA, () =>
      service.getTimeline('c-1', { cursor: '2026-05-01T00:00:00.000Z' }),
    );
    const reportIds = result.items
      .filter((i) => i.channel === 'email')
      .map((i) => i.refId);
    expect(reportIds).toContain('r-early');
    expect(reportIds).not.toContain('r-late');
  });
});
