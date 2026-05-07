/**
 * Tests del WapiCampaignsService (4.E). Espejo del email-campaigns spec con
 * deltas WAPI: phone (no email), configId (no smtpAccountId), funnel desde
 * timestamps WapiReport (no EmailEvent), CANCELED via enum dedicado.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiCampaignsService } from './wapi-campaigns.service';

describe('WapiCampaignsService', () => {
  let prisma: {
    scoped: {
      wapiCampaign: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
      wapiContact: { createMany: jest.Mock };
      wapiReport: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    };
    wapiReport: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { enqueue: jest.Mock };
  let events: { emitToTeamDebounced: jest.Mock };
  let svc: WapiCampaignsService;

  beforeEach(() => {
    prisma = {
      scoped: {
        wapiCampaign: {
          create: jest.fn().mockResolvedValue({ id: 'c1', status: 'DRAFT' }),
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
        },
        wapiContact: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        wapiReport: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      },
      wapiReport: { create: jest.fn() },
      $transaction: jest.fn((calls) => Promise.all(calls)),
    };
    queue = { enqueue: jest.fn().mockResolvedValue('job-id') };
    events = { emitToTeamDebounced: jest.fn() };
    svc = new WapiCampaignsService(prisma as never, queue as never, events as never);
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
      expect(prisma.scoped.wapiCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }),
      );
    });

    it('con scheduledAt futuro → SCHEDULED', async () => {
      const future = new Date(Date.now() + 86400000);
      await svc.create({ name: 'C1', scheduledAt: future });
      expect(prisma.scoped.wapiCampaign.create).toHaveBeenCalledWith(
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
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await svc.update('c1', { name: 'New' });
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalled();
    });

    it('PROCESSING NO permite update → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(svc.update('c1', { name: 'X' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('4.R DRAFT + scheduledAt futuro → SCHEDULED', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      const future = new Date(Date.now() + 86400000);
      await svc.update('c1', { scheduledAt: future } as never);
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SCHEDULED', scheduledAt: future }),
        }),
      );
    });

    it('4.R SCHEDULED + scheduledAt:null → DRAFT', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'SCHEDULED' });
      await svc.update('c1', { scheduledAt: null } as never);
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', scheduledAt: null }),
        }),
      );
    });

    it('4.R PAUSED + scheduledAt no toca status', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      const future = new Date(Date.now() + 86400000);
      await svc.update('c1', { scheduledAt: future } as never);
      const call = prisma.scoped.wapiCampaign.update.mock.calls[0][0];
      expect(call.data.status).toBeUndefined();
    });

    it('4.Q config.delay* válido se persiste', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await svc.update('c1', { config: { delayMinMs: 5000, delayMaxMs: 10000 } } as never);
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ config: { delayMinMs: 5000, delayMaxMs: 10000 } }),
        }),
      );
    });

    it('4.Q config.delayMinMs no entero → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(
        svc.update('c1', { config: { delayMinMs: 1500.5 } } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.scoped.wapiCampaign.update).not.toHaveBeenCalled();
    });

    it('4.Q config.delayMinMs fuera de rango (<1000) → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(
        svc.update('c1', { config: { delayMinMs: 500 } } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('4.Q config.delayMinMs > delayMaxMs → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(
        svc.update('c1', { config: { delayMinMs: 60000, delayMaxMs: 5000 } } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('4.Q config sin delays (otras keys) pasa intacto', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await svc.update('c1', { config: { bodyVars: ['firstName'] } } as never);
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalled();
    });
  });

  describe('addContacts', () => {
    it('DRAFT permite + retorna count + trim', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      prisma.scoped.wapiContact.createMany.mockResolvedValueOnce({ count: 2 });
      const r = await svc.addContacts('c1', {
        contacts: [{ phone: '  +5491100  ' }, { phone: '5492200', name: 'Ana' }],
      });
      expect(r).toEqual({ created: 2 });
      const args = prisma.scoped.wapiContact.createMany.mock.calls[0]![0];
      expect(args.data[0].phone).toBe('+5491100');
      expect(args.data[1].phone).toBe('5492200');
    });

    it('PROCESSING NO permite agregar → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(
        svc.addContacts('c1', { contacts: [{ phone: '5491100' }] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('send', () => {
    function readyCampaign() {
      return {
        id: 'c1', status: 'DRAFT', templateId: 't1', configId: 'cfg1',
        contacts: [{ id: 'k1', phone: '5491100' }, { id: 'k2', phone: '5492200' }],
      };
    }

    it('happy path: PROCESSING + reports + jobs + evento', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce(readyCampaign());
      prisma.wapiReport.create
        .mockReturnValueOnce(Promise.resolve({ id: 'r1' }))
        .mockReturnValueOnce(Promise.resolve({ id: 'r2' }));

      const r = await withCtx(() => svc.send('c1'));

      expect(r).toEqual({ enqueued: 2 });
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PROCESSING' },
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0]![0]).toEqual({
        reportId: 'r1', organizationId: 'org-1', teamId: 'team-1',
      });
      expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
        'team-1', 'wapi.report.updated', 'c1', { campaignId: 'c1' },
      );
    });

    it('sin contactos → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), contacts: [] });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin templateId → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), templateId: null });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin configId → BadRequest', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), configId: null });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PROCESSING → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ ...readyCampaign(), status: 'PROCESSING' });
      await expect(withCtx(() => svc.send('c1'))).rejects.toBeInstanceOf(ConflictException);
    });

    it('campaign no encontrada → NotFound', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce(null);
      await expect(withCtx(() => svc.send('cx'))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getReport', () => {
    it('devuelve counts + funnel desde timestamps', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.wapiReport.groupBy.mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 5 } },
        { status: 'DELIVERED', _count: { _all: 3 } },
        { status: 'READ', _count: { _all: 1 } },
        { status: 'FAILED', _count: { _all: 1 } },
      ]);
      prisma.scoped.wapiReport.count
        .mockResolvedValueOnce(10) // sent
        .mockResolvedValueOnce(8)  // delivered
        .mockResolvedValueOnce(4)  // read
        .mockResolvedValueOnce(1); // failed

      const r = await svc.getReport('c1');

      expect(r.campaignId).toBe('c1');
      expect(r.counts.SENT).toBe(5);
      expect(r.counts.DELIVERED).toBe(3);
      expect(r.counts.READ).toBe(1);
      expect(r.counts.FAILED).toBe(1);
      expect(r.counts.PENDING).toBe(0);
      expect(r.counts.CANCELED).toBe(0);
      expect(r.funnel).toEqual({ sent: 10, delivered: 8, read: 4, failed: 1 });
    });
  });

  describe('pause', () => {
    it('PROCESSING → PAUSED + notifica', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.wapiCampaign.update.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      const out = await withCtx(() => svc.pause('c1'));
      expect(out).toMatchObject({ status: 'PAUSED' });
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PAUSED' },
      });
      expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
        'team-1', 'wapi.report.updated', 'c1', { campaignId: 'c1' },
      );
    });

    it('estado distinto a PROCESSING → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(withCtx(() => svc.pause('c1'))).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.scoped.wapiCampaign.update).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('PAUSED → PROCESSING + re-enquola pendientes', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      prisma.scoped.wapiReport.findMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);
      const out = await withCtx(() => svc.resume('c1'));
      expect(out).toEqual({ resumed: true, reEnqueued: 2 });
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'PROCESSING' },
      });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0]![0]).toEqual({
        reportId: 'r1', organizationId: 'org-1', teamId: 'team-1',
      });
    });

    it('estado distinto a PAUSED → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(withCtx(() => svc.resume('c1'))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('forceClose', () => {
    it('PROCESSING → COMPLETED + cancela PENDING (status=CANCELED)', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      prisma.scoped.wapiReport.updateMany.mockResolvedValueOnce({ count: 7 });
      const out = await withCtx(() => svc.forceClose('c1'));
      expect(out).toEqual({ closed: true, canceled: 7 });
      expect(prisma.scoped.wapiReport.updateMany).toHaveBeenCalledWith({
        where: { campaignId: 'c1', status: 'PENDING' },
        data: { status: 'CANCELED', error: 'force-closed' },
      });
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' }, data: { status: 'COMPLETED' },
      });
    });

    it('PAUSED → COMPLETED + cancela PENDING', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PAUSED' });
      prisma.scoped.wapiReport.updateMany.mockResolvedValueOnce({ count: 0 });
      await withCtx(() => svc.forceClose('c1'));
      expect(prisma.scoped.wapiCampaign.update).toHaveBeenCalled();
    });

    it('DRAFT → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await expect(withCtx(() => svc.forceClose('c1'))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('DRAFT → delete', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'DRAFT' });
      await svc.remove('c1');
      expect(prisma.scoped.wapiCampaign.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('PROCESSING → Conflict', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      await expect(svc.remove('c1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listReports', () => {
    it('paginación con cursor + nextCursor', async () => {
      prisma.scoped.wapiCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'PROCESSING' });
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `r${i}`, status: 'SENT', phone: '5491100', metaMessageId: null,
        sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
        error: null, createdAt: new Date(), contact: null,
      }));
      prisma.scoped.wapiReport.findMany.mockResolvedValueOnce(rows);
      const r = await svc.listReports('c1', { limit: 2 });
      expect(r.items.length).toBe(2);
      expect(r.nextCursor).toBe('r1');
    });
  });
});
