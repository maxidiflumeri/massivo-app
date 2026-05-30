import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EmailCampaignsService } from './email-campaigns.service';

describe('EmailCampaignsService', () => {
  let prisma: {
    scoped: {
      emailCampaign: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
      emailContact: { create: jest.Mock };
      emailReport: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
      emailEvent: { count: jest.Mock };
    };
    emailReport: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { enqueue: jest.Mock };
  let events: { emitToTeamDebounced: jest.Mock };
  let contactUpsert: { upsert: jest.Mock };
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
        emailContact: { create: jest.fn().mockResolvedValue({ id: 'ec1' }) },
        emailReport: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        emailEvent: { count: jest.fn().mockResolvedValue(0) },
      },
      emailReport: { create: jest.fn() },
      $transaction: jest.fn((calls) => Promise.all(calls)),
    };
    queue = { enqueue: jest.fn().mockResolvedValue('job-id') };
    events = { emitToTeamDebounced: jest.fn() };
    contactUpsert = {
      upsert: jest.fn().mockResolvedValue({ contactId: 'k1', outcome: 'created' }),
    };
    const quota = {
      getSnapshot: jest.fn().mockResolvedValue({
        planCode: 'TEST',
        periodStart: new Date(0),
        periodEnd: new Date(0),
        used: 0,
        limit: null,
        remaining: null,
      }),
    };
    svc = new EmailCampaignsService(
      prisma as never,
      queue as never,
      events as never,
      contactUpsert as never,
      quota as never,
    );
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

    it('4.R DRAFT + scheduledAt futuro → SCHEDULED', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      const future = new Date(Date.now() + 86400000);
      await svc.update('c1', { scheduledAt: future } as never);
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SCHEDULED', scheduledAt: future }),
        }),
      );
    });

    it('4.R SCHEDULED + scheduledAt:null → DRAFT', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'SCHEDULED' });
      await svc.update('c1', { scheduledAt: null } as never);
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', scheduledAt: null }),
        }),
      );
    });

    it('4.R PAUSED + scheduledAt no toca status', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      const future = new Date(Date.now() + 86400000);
      await svc.update('c1', { scheduledAt: future } as never);
      const call = prisma.scoped.emailCampaign.update.mock.calls[0][0];
      expect(call.data.status).toBeUndefined();
    });
  });

  describe('addContacts', () => {
    it('DRAFT permite + upserta Contact + crea EmailContact con contactId', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      contactUpsert.upsert
        .mockResolvedValueOnce({ contactId: 'k1', outcome: 'created' })
        .mockResolvedValueOnce({ contactId: 'k2', outcome: 'updated' });

      const r = await svc.addContacts('c1', {
        contacts: [
          { email: 'A@b.com', externalId: 'ext-1' },
          { email: 'c@d.com', dni: '12345678', name: 'Juan Perez' },
        ],
      });

      expect(r).toEqual({
        created: 2,
        contactsCreated: 1,
        contactsUpdated: 1,
        suggestionsCreated: 0,
      });
      expect(contactUpsert.upsert).toHaveBeenCalledTimes(2);
      expect(contactUpsert.upsert.mock.calls[1]![0]).toMatchObject({
        dni: '12345678',
        firstName: 'Juan',
        lastName: 'Perez',
      });
      expect(prisma.scoped.emailContact.create).toHaveBeenCalledTimes(2);
      const firstCreate = prisma.scoped.emailContact.create.mock.calls[0]![0];
      expect(firstCreate.data.email).toBe('a@b.com');
      expect(firstCreate.data.contactId).toBe('k1');
    });

    it('fila sin externalId/dni → BadRequest y no crea nada', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(
        svc.addContacts('c1', {
          contacts: [{ email: 'a@b.com', externalId: 'ext-1' }, { email: 'c@d.com' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contactUpsert.upsert).not.toHaveBeenCalled();
      expect(prisma.scoped.emailContact.create).not.toHaveBeenCalled();
    });

    it('PROCESSING NO permite addContacts → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(
        svc.addContacts('c1', { contacts: [{ email: 'a@b.com', externalId: 'ext-1' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
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

      expect(r).toMatchObject({ enqueued: 2, quotaSkipped: 0 });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PROCESSING' },
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0]![0]).toEqual({
        reportId: 'r1', organizationId: 'org-1', teamId: 'team-1',
      });
      expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
        'team-1', 'email.report.updated', 'c1', { campaignId: 'c1' },
      );
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

  describe('pause', () => {
    it('PROCESSING → PAUSED + notifica', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.emailCampaign.update.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      const out = await withCtx(() => svc.pause('c1'));
      expect(out).toMatchObject({ status: 'PAUSED' });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PAUSED' },
      });
      expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
        'team-1', 'email.report.updated', 'c1', { campaignId: 'c1' },
      );
    });

    it('estado distinto a PROCESSING → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(withCtx(() => svc.pause('c1'))).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.scoped.emailCampaign.update).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('PAUSED → PROCESSING + re-enquola pendientes', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      prisma.scoped.emailReport.findMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);
      const out = await withCtx(() => svc.resume('c1'));
      expect(out).toEqual({ resumed: true, reEnqueued: 2 });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PROCESSING' },
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0]![0]).toEqual({
        reportId: 'r1', organizationId: 'org-1', teamId: 'team-1',
      });
    });

    it('estado distinto a PAUSED → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(withCtx(() => svc.resume('c1'))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('forceClose', () => {
    it('PROCESSING → COMPLETED + cancela PENDING', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.emailReport.updateMany.mockResolvedValueOnce({ count: 7 });
      const out = await withCtx(() => svc.forceClose('c1'));
      expect(out).toEqual({ closed: true, canceled: 7 });
      expect(prisma.scoped.emailReport.updateMany).toHaveBeenCalledWith({
        where: { campaignId: 'c1', status: 'PENDING' },
        data: { status: 'CANCELED', error: 'force-closed' },
      });
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'COMPLETED' },
      });
    });

    it('PAUSED → COMPLETED + cancela PENDING', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      prisma.scoped.emailReport.updateMany.mockResolvedValueOnce({ count: 0 });
      await withCtx(() => svc.forceClose('c1'));
      expect(prisma.scoped.emailCampaign.update).toHaveBeenCalled();
    });

    it('DRAFT → Conflict', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(withCtx(() => svc.forceClose('c1'))).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
