import { SuppressionService } from './suppression.service';
import { hashEmail } from './email-hash';

describe('SuppressionService', () => {
  let prismaScoped: {
    emailUnsubscribe: { findFirst: jest.Mock; create: jest.Mock };
    emailBounce: { findFirst: jest.Mock };
  };
  let svc: SuppressionService;

  beforeEach(() => {
    prismaScoped = {
      emailUnsubscribe: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      emailBounce: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    svc = new SuppressionService({ scoped: prismaScoped } as never);
  });

  describe('check', () => {
    it('no suppression → suppressed:false', async () => {
      const r = await svc.check({ email: 'a@b.com', campaignId: 'c1' });
      expect(r).toEqual({ suppressed: false });
    });

    it('unsubscribe GLOBAL bloquea cualquier campaña', async () => {
      prismaScoped.emailUnsubscribe.findFirst.mockResolvedValueOnce({ scope: 'GLOBAL' });
      const r = await svc.check({ email: 'a@b.com', campaignId: 'c1' });
      expect(r).toEqual({ suppressed: true, reason: 'unsubscribe-global' });
    });

    it('unsubscribe CAMPAIGN match bloquea solo esa campaña', async () => {
      prismaScoped.emailUnsubscribe.findFirst.mockResolvedValueOnce({ scope: 'CAMPAIGN' });
      const r = await svc.check({ email: 'a@b.com', campaignId: 'c1' });
      expect(r).toEqual({ suppressed: true, reason: 'unsubscribe-campaign' });
      const where = prismaScoped.emailUnsubscribe.findFirst.mock.calls[0]![0].where;
      expect(where.OR).toContainEqual({ scope: 'CAMPAIGN', campaignId: 'c1' });
    });

    it('bounce hard bloquea', async () => {
      prismaScoped.emailBounce.findFirst.mockResolvedValueOnce({ id: 'b1' });
      const r = await svc.check({ email: 'A@B.COM', campaignId: 'c1' });
      expect(r).toEqual({ suppressed: true, reason: 'bounce-hard' });
      expect(prismaScoped.emailBounce.findFirst.mock.calls[0]![0].where.email).toBe('a@b.com');
    });

    it('busca por hash normalizado (case-insensitive)', async () => {
      await svc.check({ email: 'Foo@BAR.com', campaignId: 'c1' });
      expect(prismaScoped.emailUnsubscribe.findFirst.mock.calls[0]![0].where.emailHash).toBe(
        hashEmail('Foo@BAR.com'),
      );
    });
  });

  describe('addUnsubscribe', () => {
    it('crea EmailUnsubscribe GLOBAL con email normalizado', async () => {
      await svc.addUnsubscribe({ email: 'A@B.COM', scope: 'GLOBAL' });
      expect(prismaScoped.emailUnsubscribe.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'a@b.com',
          emailHash: hashEmail('A@B.COM'),
          scope: 'GLOBAL',
          campaignId: null,
        }),
      });
    });

    it('CAMPAIGN sin campaignId → campaignId:null igual (degradado seguro)', async () => {
      await svc.addUnsubscribe({ email: 'a@b.com', scope: 'CAMPAIGN' });
      expect(prismaScoped.emailUnsubscribe.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ scope: 'CAMPAIGN', campaignId: null }),
      });
    });

    it('idempotente: si ya existe, no crea', async () => {
      prismaScoped.emailUnsubscribe.findFirst.mockResolvedValueOnce({ id: 'u1' });
      await svc.addUnsubscribe({ email: 'a@b.com', scope: 'GLOBAL' });
      expect(prismaScoped.emailUnsubscribe.create).not.toHaveBeenCalled();
    });
  });
});
