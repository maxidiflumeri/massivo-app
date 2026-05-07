import { WapiCampaignSchedulerService } from './wapi-campaign-scheduler.service';

describe('WapiCampaignSchedulerService', () => {
  let prisma: { wapiCampaign: { findMany: jest.Mock } };
  let campaigns: { send: jest.Mock };
  let auditLog: { log: jest.Mock };
  let svc: WapiCampaignSchedulerService;

  beforeEach(() => {
    prisma = { wapiCampaign: { findMany: jest.fn().mockResolvedValue([]) } };
    campaigns = { send: jest.fn().mockResolvedValue({ enqueued: 0 }) };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    svc = new WapiCampaignSchedulerService(
      prisma as never,
      campaigns as never,
      auditLog as never,
    );
  });

  it('sin campañas vencidas → fired: 0', async () => {
    const result = await svc.tick();
    expect(result.fired).toBe(0);
    expect(campaigns.send).not.toHaveBeenCalled();
  });

  it('despacha cada campaña vencida bajo TenantContext de su org/team', async () => {
    prisma.wapiCampaign.findMany.mockResolvedValueOnce([
      { id: 'c1', organizationId: 'org-1', teamId: 'team-1', name: 'C1' },
      { id: 'c2', organizationId: 'org-2', teamId: 'team-2', name: 'C2' },
    ]);
    const result = await svc.tick();
    expect(result.fired).toBe(2);
    expect(campaigns.send).toHaveBeenCalledTimes(2);
    expect(campaigns.send).toHaveBeenNthCalledWith(1, 'c1');
    expect(campaigns.send).toHaveBeenNthCalledWith(2, 'c2');
  });

  it('si send() falla en una, sigue con las demás', async () => {
    prisma.wapiCampaign.findMany.mockResolvedValueOnce([
      { id: 'c1', organizationId: 'org-1', teamId: 'team-1', name: 'C1' },
      { id: 'c2', organizationId: 'org-2', teamId: 'team-2', name: 'C2' },
    ]);
    campaigns.send.mockRejectedValueOnce(new Error('boom'));
    campaigns.send.mockResolvedValueOnce({ enqueued: 5 });
    const result = await svc.tick();
    expect(result.fired).toBe(1);
    expect(campaigns.send).toHaveBeenCalledTimes(2);
  });

  it('filtra por status SCHEDULED y scheduledAt vencido', async () => {
    await svc.tick();
    expect(prisma.wapiCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SCHEDULED',
          scheduledAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});
