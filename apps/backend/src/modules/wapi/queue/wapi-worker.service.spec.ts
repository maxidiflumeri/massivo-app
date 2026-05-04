/**
 * Tests del WapiWorkerService.process. No bootstrappea BullMQ — llama process(job)
 * con un Job sintético. Mockea PrismaService.scoped + sender + events.
 *
 * Cubre:
 *  - happy path: sendTemplate OK → SENT + metaMessageId + sleep jitter
 *  - report no encontrado (cross-tenant via prisma.scoped) → tira
 *  - campaign PAUSED → moveToDelayed sin tocar report ni sender
 *  - campaign COMPLETED + report PENDING → FAILED con error 'campaign-closed'
 *  - daily limit alcanzado → moveToDelayed 1h, no llama sender
 *  - rate-limit code 131056 → moveToDelayed con backoff exponencial, NO marca FAILED
 *  - error auth (190) → marca FAILED y rethrow
 *  - vars del template: si campaign.config.bodyVars=['firstName'], envía components
 *  - último report SENT → transiciona campaign PROCESSING → COMPLETED
 */
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { WapiWorkerService } from './wapi-worker.service';
import { WapiSendException } from '../sender/wapi-sender.types';
import type { WapiSendJob } from './wapi-queue.types';

describe('WapiWorkerService.process', () => {
  let prismaScoped: {
    wapiReport: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  };
  let prismaRoot: { wapiCampaign: { updateMany: jest.Mock } };
  let sender: { sendTemplate: jest.Mock };
  let events: { emitToTeamDebounced: jest.Mock; emitToTeam: jest.Mock };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock; isEncrypted: jest.Mock };
  let worker: WapiWorkerService;

  beforeEach(() => {
    prismaScoped = {
      wapiReport: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    prismaRoot = {
      wapiCampaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    sender = { sendTemplate: jest.fn() };
    events = { emitToTeamDebounced: jest.fn(), emitToTeam: jest.fn() };
    encryption = {
      encrypt: jest.fn((v: string) => `enc(${v})`),
      decrypt: jest.fn((v: string) => v.replace(/^enc\(|\)$/g, '')),
      isEncrypted: jest.fn((v: string) => v.startsWith('enc(')),
    };
    // Forzar jitter a 0 para no demorar tests
    worker = new WapiWorkerService(
      new ConfigService({ WAPI_DELAY_MIN_MS: '0', WAPI_DELAY_MAX_MS: '0' }),
      { scoped: prismaScoped, ...prismaRoot } as never,
      sender as never,
      events as never,
      encryption as never,
    );
  });

  function jobOf(payload: WapiSendJob, overrides: Partial<Job<WapiSendJob>> = {}): Job<WapiSendJob> {
    return {
      data: payload,
      id: payload.reportId,
      attemptsMade: 0,
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as never;
  }

  function reportFixture(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'rep-1',
      organizationId: 'org-a',
      teamId: 'team-a',
      campaignId: 'camp-1',
      phone: '5491100',
      status: 'PENDING',
      contact: { id: 'c-1', phone: '5491100', data: { firstName: 'Ana' } },
      campaign: {
        id: 'camp-1',
        status: 'PROCESSING',
        config: null,
        template: { metaName: 'welcome', language: 'es' },
        configRel: {
          id: 'cfg-1',
          phoneNumberId: 'ph1',
          accessTokenEnc: 'tok-plain',
          dailyLimit: 200,
        },
      },
      ...overrides,
    };
  }

  it('happy path: sendTemplate OK → SENT + metaMessageId', async () => {
    const fix = reportFixture();
    fix.campaign.configRel.accessTokenEnc = 'enc(real-token)';
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(fix);
    sender.sendTemplate.mockResolvedValueOnce({ metaMessageId: 'wamid.A', raw: {} });

    const out = await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(out).toEqual({ metaMessageId: 'wamid.A' });
    expect(sender.sendTemplate).toHaveBeenCalledTimes(1);
    expect(encryption.decrypt).toHaveBeenCalledWith('enc(real-token)');
    const [cfgArg, inputArg] = sender.sendTemplate.mock.calls[0]!;
    expect(cfgArg).toEqual({ phoneNumberId: 'ph1', accessToken: 'real-token' });
    expect(inputArg.to).toBe('5491100');
    expect(inputArg.templateName).toBe('welcome');
    expect(inputArg.language).toBe('es');
    expect(inputArg.components).toBeUndefined();

    expect(prismaScoped.wapiReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({
        status: 'SENT',
        metaMessageId: 'wamid.A',
        error: null,
      }),
    });
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a',
      'wapi.report.log',
      expect.objectContaining({
        campaignId: 'camp-1',
        status: 'SENT',
        metaMessageId: 'wamid.A',
      }),
    );
  });

  it('report no encontrado → tira sin tocar sender', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(null);

    await expect(
      worker.process(jobOf({ reportId: 'rep-x', organizationId: 'org-b', teamId: 'team-b' })),
    ).rejects.toThrow(/not found in tenant/);

    expect(sender.sendTemplate).not.toHaveBeenCalled();
  });

  it('campaign PAUSED → moveToDelayed, no toca report ni sender', async () => {
    const fix = reportFixture();
    fix.campaign.status = 'PAUSED';
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(fix);
    const job = jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' });

    const out = await worker.process(job);

    expect(out).toEqual({ paused: true });
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(sender.sendTemplate).not.toHaveBeenCalled();
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('campaign COMPLETED + report PENDING → CANCELED con campaign-closed', async () => {
    const fix = reportFixture();
    fix.campaign.status = 'COMPLETED';
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(fix);

    const out = await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(out).toEqual({ canceled: true });
    expect(sender.sendTemplate).not.toHaveBeenCalled();
    expect(prismaScoped.wapiReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: { status: 'CANCELED', error: 'campaign-closed' },
    });
  });

  it('report ya CANCELED (forceClose previo) → skip sin enviar ni update', async () => {
    const fix = reportFixture();
    fix.status = 'CANCELED';
    fix.campaign.status = 'COMPLETED';
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(fix);

    const out = await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(out).toEqual({ canceled: true });
    expect(sender.sendTemplate).not.toHaveBeenCalled();
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('dailyLimit alcanzado → moveToDelayed 1h, no llama sender', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(reportFixture());
    // 1ª count = sentToday (200 igual al limit), 2ª no se llamaría porque salimos antes
    prismaScoped.wapiReport.count.mockResolvedValueOnce(200);
    const job = jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' });

    const out = await worker.process(job);

    expect(out).toEqual({ dailyLimitReached: true });
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(sender.sendTemplate).not.toHaveBeenCalled();
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('rate-limit code 131056 → moveToDelayed con backoff exponencial, NO FAILED', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(reportFixture());
    sender.sendTemplate.mockRejectedValueOnce(
      new WapiSendException({
        code: 131056,
        subCode: null,
        message: 'pair rate limit',
        isRateLimit: true,
        isAuth: false,
        retryable: true,
        raw: {},
      }),
    );
    const job = jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }, {
      attemptsMade: 2,
    });

    const out = await worker.process(job);

    expect(out).toEqual({ rateLimited: true });
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    // No marca FAILED — el report sigue PENDING para reintento
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('error auth (190) → FAILED y rethrow', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(reportFixture());
    sender.sendTemplate.mockRejectedValueOnce(
      new WapiSendException({
        code: 190,
        subCode: null,
        message: 'Invalid OAuth token',
        isRateLimit: false,
        isAuth: true,
        retryable: false,
        raw: {},
      }),
    );

    await expect(
      worker.process(jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' })),
    ).rejects.toThrow(/Invalid OAuth token/);

    expect(prismaScoped.wapiReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({ status: 'FAILED', error: 'Invalid OAuth token' }),
    });
  });

  it('campaign.config.bodyVars=["firstName"] → envía components con vars del contact', async () => {
    const fix = reportFixture();
    (fix.campaign as { config: unknown }).config = { bodyVars: ['firstName'] };
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(fix);
    sender.sendTemplate.mockResolvedValueOnce({ metaMessageId: 'wamid.X', raw: {} });

    await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    const [, inputArg] = sender.sendTemplate.mock.calls[0]!;
    expect(inputArg.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
    ]);
  });

  it('último report SENT → transiciona campaign PROCESSING → COMPLETED', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(reportFixture());
    sender.sendTemplate.mockResolvedValueOnce({ metaMessageId: 'wamid.X', raw: {} });
    // 1er count: dailyLimit check (sentToday=0). 2do count: maybeCompleteCampaign (PENDING=0).
    prismaScoped.wapiReport.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaRoot.wapiCampaign.updateMany.mockResolvedValueOnce({ count: 1 });

    await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(prismaRoot.wapiCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', status: 'PROCESSING' },
      data: { status: 'COMPLETED' },
    });
  });
});
