import { EmailCampaignSchedulerService } from './email-campaign-scheduler.service';

describe('EmailCampaignSchedulerService', () => {
  let prisma: { emailCampaign: { findMany: jest.Mock } };
  let campaigns: { send: jest.Mock };
  let svc: EmailCampaignSchedulerService;

  beforeEach(() => {
    prisma = { emailCampaign: { findMany: jest.fn().mockResolvedValue([]) } };
    campaigns = { send: jest.fn().mockResolvedValue({ enqueued: 0 }) };
    svc = new EmailCampaignSchedulerService(prisma as never, campaigns as never);
  });

  it('sin campañas vencidas → fired: 0', async () => {
    const result = await svc.tick();
    expect(result.fired).toBe(0);
    expect(campaigns.send).not.toHaveBeenCalled();
  });

  it('despacha cada campaña vencida bajo TenantContext de su org/team', async () => {
    prisma.emailCampaign.findMany.mockResolvedValueOnce([
      { id: 'c1', organizationId: 'org-1', teamId: 'team-1', name: 'C1' },
      { id: 'c2', organizationId: 'org-2', teamId: 'team-2', name: 'C2' },
    ]);
    const result = await svc.tick();
    expect(result.fired).toBe(2);
    expect(campaigns.send).toHaveBeenCalledTimes(2);
  });

  it('si send() falla en una, sigue con las demás', async () => {
    prisma.emailCampaign.findMany.mockResolvedValueOnce([
      { id: 'c1', organizationId: 'org-1', teamId: 'team-1', name: 'C1' },
      { id: 'c2', organizationId: 'org-2', teamId: 'team-2', name: 'C2' },
    ]);
    campaigns.send.mockRejectedValueOnce(new Error('boom'));
    campaigns.send.mockResolvedValueOnce({ enqueued: 3 });
    const result = await svc.tick();
    expect(result.fired).toBe(1);
  });
});
