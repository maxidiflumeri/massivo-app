import { EmailMetricsService } from './email-metrics.service';

describe('EmailMetricsService.getOverview', () => {
  let prisma: {
    scoped: {
      emailReport: { groupBy: jest.Mock; count: jest.Mock };
      emailCampaign: { findMany: jest.Mock };
    };
  };
  let svc: EmailMetricsService;

  beforeEach(() => {
    prisma = {
      scoped: {
        emailReport: {
          groupBy: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        emailCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    svc = new EmailMetricsService(prisma as never);
  });

  it('agrega totales por status, calcula rates y arma respuesta completa', async () => {
    // Primera llamada groupBy: status totals
    prisma.scoped.emailReport.groupBy
      .mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 100 } },
        { status: 'BOUNCED', _count: { _all: 5 } },
        { status: 'COMPLAINED', _count: { _all: 1 } },
        { status: 'SUPPRESSED', _count: { _all: 2 } },
        { status: 'FAILED', _count: { _all: 3 } },
      ])
      // Top campaigns groupBy
      .mockResolvedValueOnce([
        { campaignId: 'c1', _count: { _all: 60 } },
        { campaignId: 'c2', _count: { _all: 40 } },
      ])
      // opensByCampaign
      .mockResolvedValueOnce([{ campaignId: 'c1', _count: { _all: 30 } }])
      // clicksByCampaign
      .mockResolvedValueOnce([{ campaignId: 'c1', _count: { _all: 10 } }]);

    // Las dos primeras count() son uniqueOpens y uniqueClicks
    prisma.scoped.emailReport.count
      .mockResolvedValueOnce(40) // uniqueOpens
      .mockResolvedValueOnce(15); // uniqueClicks

    prisma.scoped.emailCampaign.findMany.mockResolvedValueOnce([
      { id: 'c1', name: 'Campaña 1' },
      { id: 'c2', name: 'Campaña 2' },
    ]);

    const r = await svc.getOverview(7);

    expect(r.windowDays).toBe(7);
    expect(r.totals).toEqual({
      sent: 100,
      failed: 3,
      bounced: 5,
      complained: 1,
      suppressed: 2,
      pending: 0,
    });
    expect(r.uniqueOpens).toBe(40);
    expect(r.uniqueClicks).toBe(15);
    expect(r.rates.openRate).toBe(0.4); // 40/100
    expect(r.rates.clickRate).toBe(0.15); // 15/100
    expect(r.rates.bounceRate).toBeCloseTo(5 / 105, 4); // bounced / (sent+bounced)
    expect(r.rates.complaintRate).toBe(0.01);

    expect(r.topCampaigns).toHaveLength(2);
    expect(r.topCampaigns[0]).toEqual({
      id: 'c1',
      name: 'Campaña 1',
      sent: 60,
      uniqueOpens: 30,
      uniqueClicks: 10,
      openRate: 0.5,
      clickRate: 0.1667, // 10/60 redondeado a 4 decimales
    });
    expect(r.topCampaigns[1]).toEqual({
      id: 'c2',
      name: 'Campaña 2',
      sent: 40,
      uniqueOpens: 0,
      uniqueClicks: 0,
      openRate: 0,
      clickRate: 0,
    });
  });

  it('rates = 0 si no hay sent', async () => {
    prisma.scoped.emailReport.groupBy
      .mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 5 } }])
      .mockResolvedValueOnce([]); // top campaigns vacío
    prisma.scoped.emailReport.count.mockResolvedValue(0);

    const r = await svc.getOverview(30);

    expect(r.totals.sent).toBe(0);
    expect(r.totals.pending).toBe(5);
    expect(r.rates).toEqual({
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      complaintRate: 0,
    });
    expect(r.topCampaigns).toEqual([]);
  });

  it('window 30 calcula `from` 30 días atrás', async () => {
    prisma.scoped.emailReport.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.scoped.emailReport.count.mockResolvedValue(0);

    const before = Date.now();
    const r = await svc.getOverview(30);
    const after = Date.now();

    const fromTs = new Date(r.from).getTime();
    const toTs = new Date(r.to).getTime();
    const span = toTs - fromTs;
    expect(span).toBe(30 * 24 * 60 * 60 * 1000);
    expect(toTs).toBeGreaterThanOrEqual(before);
    expect(toTs).toBeLessThanOrEqual(after);
  });
});
