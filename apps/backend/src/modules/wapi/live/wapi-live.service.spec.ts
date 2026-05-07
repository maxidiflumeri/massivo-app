import { WapiLiveService } from './wapi-live.service';

interface ScopedMocks {
  wapiCampaign: { findMany: jest.Mock };
  wapiReport: { groupBy: jest.Mock };
  wapiConfig: { findMany: jest.Mock };
  wapiConversation: { count: jest.Mock; findFirst: jest.Mock };
}

function buildSvc(scoped: ScopedMocks) {
  return new WapiLiveService({ scoped } as never);
}

describe('WapiLiveService', () => {
  let scoped: ScopedMocks;

  beforeEach(() => {
    scoped = {
      wapiCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      wapiReport: { groupBy: jest.fn().mockResolvedValue([]) },
      wapiConfig: { findMany: jest.fn().mockResolvedValue([]) },
      wapiConversation: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
  });

  it('snapshot vacío: campaigns/configs vacíos + inbox en cero', async () => {
    const svc = buildSvc(scoped);
    const out = await svc.snapshot();

    expect(out.campaigns).toEqual([]);
    expect(out.configs).toEqual([]);
    expect(out.inbox).toEqual({
      unassigned: 0,
      waiting: 0,
      escalatedTotal: 0,
      oldestUnassignedAt: null,
    });
    expect(out.generatedAt).toBeInstanceOf(Date);
    // Inbox: 3 counts + 1 findFirst.
    expect(scoped.wapiConversation.count).toHaveBeenCalledTimes(3);
  });

  it('arma totals + throughput por campaña activa', async () => {
    scoped.wapiCampaign.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'Promo abril',
        status: 'PROCESSING',
        configId: 'cfg1',
        sentAt: new Date('2026-05-06T10:00:00Z'),
        config: null,
        configRel: { name: 'Línea principal', sendDelayMinMs: 30000, sendDelayMaxMs: 60000 },
        template: { metaName: 'promo_abril' },
      },
      {
        id: 'c2',
        name: 'Recordatorio',
        status: 'PAUSED',
        configId: 'cfg2',
        sentAt: null,
        config: { delayMinMs: 5000, delayMaxMs: 10000 },
        configRel: { name: null, sendDelayMinMs: 30000, sendDelayMaxMs: 60000 },
        template: { metaName: null },
      },
    ]);

    // 1) groupBy de status por campaña
    scoped.wapiReport.groupBy
      .mockResolvedValueOnce([
        { campaignId: 'c1', status: 'SENT', _count: { _all: 50 } },
        { campaignId: 'c1', status: 'DELIVERED', _count: { _all: 30 } },
        { campaignId: 'c1', status: 'PENDING', _count: { _all: 20 } },
        { campaignId: 'c2', status: 'PENDING', _count: { _all: 5 } },
      ])
      // 2) throughput last5min
      .mockResolvedValueOnce([{ campaignId: 'c1', _count: { _all: 12 } }]);

    const svc = buildSvc(scoped);
    const out = await svc.snapshot();

    expect(out.campaigns).toHaveLength(2);
    const [c1, c2] = out.campaigns;
    expect(c1!.id).toBe('c1');
    expect(c1!.totals).toEqual({
      PENDING: 20,
      SENT: 50,
      DELIVERED: 30,
      READ: 0,
      FAILED: 0,
      CANCELED: 0,
    });
    expect(c1!.total).toBe(100);
    expect(c1!.throughputLast5min).toBe(12);
    expect(c1!.configName).toBe('Línea principal');
    expect(c1!.templateName).toBe('promo_abril');
    expect(c2!.totals.PENDING).toBe(5);
    expect(c2!.throughputLast5min).toBe(0);

    // 4.Q — c1 hereda del config; c2 tiene override per-campaña
    expect(c1!.delaySource).toBe('config');
    expect(c1!.delayMinMs).toBe(30000);
    expect(c1!.delayMaxMs).toBe(60000);
    expect(c2!.delaySource).toBe('campaign');
    expect(c2!.delayMinMs).toBe(5000);
    expect(c2!.delayMaxMs).toBe(10000);
  });

  it('configs: percent calculado contra dailyLimit con cap a 100', async () => {
    scoped.wapiConfig.findMany.mockResolvedValueOnce([
      {
        id: 'cfg1',
        name: 'Línea principal',
        phoneNumberId: '111',
        dailyLimit: 200,
        isTestMode: false,
        sendDelayMinMs: 30000,
        sendDelayMaxMs: 60000,
      },
      {
        id: 'cfg2',
        name: 'Línea secundaria',
        phoneNumberId: '222',
        dailyLimit: 100,
        isTestMode: true,
        sendDelayMinMs: 15000,
        sendDelayMaxMs: 25000,
      },
    ]);
    // 1) groupBy de status (vacío) — esto se llama incluso si no hay campañas activas? no, sólo si hay rows. dejamos vacío
    // Reports last24h por campaña → mapeamos a config vía wapiCampaign.findMany #2
    scoped.wapiReport.groupBy.mockResolvedValueOnce([
      { campaignId: 'campA', _count: { _all: 180 } },
      { campaignId: 'campB', _count: { _all: 250 } },
    ]);
    // wapiCampaign.findMany se llama 2 veces: 1) collectCampaigns (vacío) y
    // 2) collectConfigs (mapping campaignId→configId). El primer slot queda
    // vacío, el segundo tiene el mapping.
    scoped.wapiCampaign.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'campA', configId: 'cfg1' },
        { id: 'campB', configId: 'cfg2' },
      ]);

    const svc = buildSvc(scoped);
    const out = await svc.snapshot();

    expect(out.configs).toEqual([
      expect.objectContaining({
        id: 'cfg1',
        sentLast24h: 180,
        percent: 90,
        sendDelayMinMs: 30000,
        sendDelayMaxMs: 60000,
      }),
      expect.objectContaining({
        id: 'cfg2',
        sentLast24h: 250,
        percent: 100,
        isTestMode: true,
        sendDelayMinMs: 15000,
        sendDelayMaxMs: 25000,
      }),
    ]);
  });

  it('inbox: counts + más antigua sin asignar', async () => {
    scoped.wapiConversation.count
      .mockResolvedValueOnce(3) // unassigned
      .mockResolvedValueOnce(5) // waiting
      .mockResolvedValueOnce(11); // escalatedTotal
    const oldest = new Date('2026-05-06T08:00:00Z');
    scoped.wapiConversation.findFirst.mockResolvedValueOnce({ lastMessageAt: oldest });

    const svc = buildSvc(scoped);
    const out = await svc.snapshot();

    expect(out.inbox).toEqual({
      unassigned: 3,
      waiting: 5,
      escalatedTotal: 11,
      oldestUnassignedAt: oldest,
    });
  });
});
