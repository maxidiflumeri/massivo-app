import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EmailCampaignsService } from './email-campaigns.service';

describe('EmailCampaignsService', () => {
  let prisma: {
    scoped: {
      emailCampaign: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
      emailContact: { createMany: jest.Mock };
      emailReport: { groupBy: jest.Mock; count: jest.Mock };
      emailEvent: { count: jest.Mock };
    };
    emailReport: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { enqueue: jest.Mock };
  let svc: EmailCampaignsService;

  beforeEach(() => {
    prisma = {
      scoped: {
        emailCampaign: {
          create: jest.fn().mockResolvedValue({ id: 'c1', status: 'DRAFT' }),
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        },
        emailContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        emailReport: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        emailEvent: { count: jest.fn().mockResolvedValue(0) },
      },
      emailReport: { create: jest.fn() },
      $transaction: jest.fn((calls) => Promise.all(calls)),
    };
    queue = { enqueue: jest.fn().mockResolvedValue('job-id') };
    svc = new EmailCampaignsService(prisma as never, queue as never);
  });

  function withCtx<T>(fn: () => Promise<T>) {
    return TenantContext.run(
      { userId: 'u', organizationId: 'org-1', teamId: 'team-1', orgRole: 'OWNER', teamRole: 'ADMIN' },
      fn,
    );
  }

  describe('create', () => {
    it('sin scheduledAt → DRAFT', async () => {
      await svc.create({ name: 'C1' });
      expect(prisma.scoped.emailCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }),
      );
    });

    it('con scheduledAt futuro → SCHEDULED', async () => {
      const future = new Date(Date.now() + 86400000);
      await svc.create({ name: 'C1', scheduledAt: future });
      expect(prisma.scoped.emailCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
      );
    });

    it('scheduledAt pasado → BadRequest', async () => {
      const past = new Date(Date.now() - 1000);
      await expect(svc.create({ name: 'C1', scheduledAt: past })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('DRAFT permite update', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await svc.update('c1', { name: 'New' });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalled();
    });

    it('PROCESSING NO permite update → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(svc.update('c1', { name: 'X' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('addContacts', () => {
    it('DRAFT permite + retorna count', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      prisma.scoped.emailContact.createMany.mockResolvedValueOnce({ count: 2 });
      const r = await svc.addContacts('c1', { contacts: [{ email: 'A@b.com' }, { email: 'c@d.com' }] });
      expect(r).toEqual({ created: 2 });
      const args = prisma.scoped.emailContact.createMany.mock.calls[0]![0];
      expect(args.data[0].email).toBe('a@b.com');
    });
  });

  describe('send', () => {
    function readyCampaign() {
      return {
        id: 'c1', status: 'DRAFT', templateId: 't1', smtpAccountId: 's1',
        contacts: [{ id: 'k1' }, { id: 'k2' }],
      };
    }

    it('happy path: actualiza PROCESSING + crea reports + enquola', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce(readyCampaign());
      prisma.emailReport.create
        .mockReturnValueOnce(Promise.resolve({ id: 'r1' }))
        .mockReturnValueOnce(Promise.resolve({ id: 'r2' }));

      const r = await withCtx(() => svc.send('c1'));

      expect(r).toEqual({ enqueued: 2 });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PROCESSING' },
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0]![0]).toEqual({
        reportId: 'r1', organizationId: 'org-1', teamId: 'team-1',
      });
    });

    it('sin contactos → BadRequest', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), contacts: [] });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin templateId → BadRequest', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), templateId: null });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PROCESSING → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), status: 'PROCESSING' });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(ConflictException);
    });

    it('campaign no encontrada → NotFound', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce(null);
      await expect(withCtx(() => svc.send('cx'))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getReport', () => {
    it('devuelve counts + events', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.emailReport.groupBy.mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 5 } },
        { status: 'FAILED', _count: { _all: 1 } },
      ]);
      prisma.scoped.emailEvent.count
        .mockResolvedValueOnce(10) // opens
        .mockResolvedValueOnce(3); // clicks
      prisma.scoped.emailReport.count
        .mockResolvedValueOnce(4) // uniqueOpens
        .mockResolvedValueOnce(2); // uniqueClicks

      const r = await svc.getReport('c1');

      expect(r.campaignId).toBe('c1');
      expect(r.counts.SENT).toBe(5);
      expect(r.counts.FAILED).toBe(1);
      expect(r.counts.PENDING).toBe(0);
      expect(r.counts.SUPPRESSED).toBe(0);
      expect(r.events).toEqual({ opens: 10, clicks: 3, uniqueOpens: 4, uniqueClicks: 2 });
    });
  });
});
