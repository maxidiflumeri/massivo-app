/**
 * Tests del EmailWorkerService.process. No bootstrappea BullMQ (no toca Redis):
 * llama process(job) directo con un Job sintético. Mockea PrismaService.scoped y
 * EmailSenderService para verificar:
 *   - render handlebars (vars de contact.data)
 *   - update EmailReport SENT + smtpMessageId
 *   - error en sender → update FAILED + rethrow
 *   - report no encontrado (cross-tenant via prisma.scoped) → throw
 */
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EmailWorkerService } from './email-worker.service';
import type { EmailSendJob } from './email-queue.types';

describe('EmailWorkerService.process', () => {
  let prismaScoped: {
    emailReport: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
  };
  let prismaRoot: { emailCampaign: { updateMany: jest.Mock } };
  let senders: { sendForAccount: jest.Mock };
  let tokens: { sign: jest.Mock; publicUrl: jest.Mock };
  let suppression: { check: jest.Mock };
  let events: { emitToTeamDebounced: jest.Mock; emitToTeam: jest.Mock };
  let worker: EmailWorkerService;

  beforeEach(() => {
    prismaScoped = {
      emailReport: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    prismaRoot = {
      emailCampaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    senders = { sendForAccount: jest.fn() };
    tokens = {
      sign: jest.fn().mockReturnValue('tok-fake'),
      publicUrl: jest.fn().mockReturnValue('http://localhost:3001'),
    };
    suppression = {
      check: jest.fn().mockResolvedValue({ suppressed: false }),
    };
    events = { emitToTeamDebounced: jest.fn(), emitToTeam: jest.fn() };
    worker = new EmailWorkerService(
      new ConfigService({}),
      { scoped: prismaScoped, ...prismaRoot } as never,
      senders as never,
      tokens as never,
      suppression as never,
      events as never,
    );
  });

  function jobOf(payload: EmailSendJob): Job<EmailSendJob> {
    return { data: payload, id: payload.reportId } as never;
  }

  function reportFixture(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'rep-1',
      organizationId: 'org-a',
      teamId: 'team-a',
      campaignId: 'camp-1',
      contact: { id: 'c-1', email: 'user@example.com', data: { firstName: 'Ana' } },
      campaign: {
        template: { subject: 'Hola {{firstName}}', html: '<p>Hi {{firstName}}</p>' },
        smtpAccount: {
          id: 'acc-1',
          teamId: 'team-a',
          host: 'localhost',
          port: 1025,
          username: '',
          passwordEnc: '',
          fromName: 'Acme',
          fromEmail: 'no-reply@acme.com',
          provider: 'smtp',
          sesConfigSet: null,
        },
      },
      ...overrides,
    };
  }

  it('envío feliz: renderiza, llama sender, update SENT con messageId', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(reportFixture());
    senders.sendForAccount.mockResolvedValueOnce({ messageId: 'msg-x', provider: 'smtp' });

    const out = await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(out).toEqual({ messageId: 'msg-x' });
    expect(senders.sendForAccount).toHaveBeenCalledTimes(1);
    const sendArgs = senders.sendForAccount.mock.calls[0]![1];
    expect(sendArgs.to).toBe('user@example.com');
    expect(sendArgs.subject).toBe('Hola Ana');
    expect(sendArgs.html).toContain('<p>Hi Ana</p>');
    expect(sendArgs.html).toContain('track/open.gif?t=tok-fake');
    expect(tokens.sign).toHaveBeenCalledWith({
      r: 'rep-1', o: 'org-a', t: 'team-a', c: 'camp-1',
    });

    expect(prismaScoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({
        status: 'SENT',
        smtpMessageId: 'msg-x',
        subject: 'Hola Ana',
        trackingToken: 'tok-fake',
        error: null,
      }),
    });
    expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
      'team-a', 'email.report.updated', 'camp-1', { campaignId: 'camp-1' },
    );
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a',
      'email.report.log',
      expect.objectContaining({
        campaignId: 'camp-1',
        reportId: 'rep-1',
        email: 'user@example.com',
        status: 'SENT',
        messageId: 'msg-x',
        ts: expect.any(String),
      }),
    );
  });

  it('sender tira → update FAILED + rethrow', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(reportFixture());
    senders.sendForAccount.mockRejectedValueOnce(new Error('SES throttle'));

    await expect(
      worker.process(jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' })),
    ).rejects.toThrow(/SES throttle/);

    expect(prismaScoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: { status: 'FAILED', error: 'SES throttle' },
    });
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a',
      'email.report.log',
      expect.objectContaining({
        campaignId: 'camp-1',
        status: 'FAILED',
        error: 'SES throttle',
      }),
    );
  });

  it('report no encontrado (cross-tenant via prisma.scoped) → tira sin tocar sender', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(null);

    await expect(
      worker.process(jobOf({ reportId: 'rep-x', organizationId: 'org-b', teamId: 'team-b' })),
    ).rejects.toThrow(/not found in tenant/);

    expect(senders.sendForAccount).not.toHaveBeenCalled();
    expect(prismaScoped.emailReport.update).not.toHaveBeenCalled();
  });

  it('email suprimido (unsubscribe) → SUPPRESSED, no llama sender', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(reportFixture());
    suppression.check.mockResolvedValueOnce({ suppressed: true, reason: 'unsubscribe-global' });

    const out = await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(out).toEqual({ suppressed: true, reason: 'unsubscribe-global' });
    expect(senders.sendForAccount).not.toHaveBeenCalled();
    expect(prismaScoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: { status: 'SUPPRESSED', error: 'unsubscribe-global' },
    });
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a',
      'email.report.log',
      expect.objectContaining({
        campaignId: 'camp-1',
        status: 'SUPPRESSED',
        error: 'unsubscribe-global',
      }),
    );
  });

  it('último report SENT → transiciona campaign PROCESSING → COMPLETED', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(reportFixture());
    senders.sendForAccount.mockResolvedValueOnce({ messageId: 'msg-x', provider: 'smtp' });
    // No quedan reports pendientes después de éste
    prismaScoped.emailReport.count.mockResolvedValueOnce(0);
    prismaRoot.emailCampaign.updateMany.mockResolvedValueOnce({ count: 1 });

    await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(prismaScoped.emailReport.count).toHaveBeenCalledWith({
      where: { campaignId: 'camp-1', status: 'PENDING' },
    });
    expect(prismaRoot.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', status: 'PROCESSING' },
      data: { status: 'COMPLETED' },
    });
    // Notificación extra al transicionar
    expect(events.emitToTeamDebounced).toHaveBeenCalledTimes(2);
  });

  it('quedan reports PENDING → no transiciona campaign', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(reportFixture());
    senders.sendForAccount.mockResolvedValueOnce({ messageId: 'msg-x', provider: 'smtp' });
    prismaScoped.emailReport.count.mockResolvedValueOnce(3);

    await worker.process(
      jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' }),
    );

    expect(prismaRoot.emailCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('campaign sin template → tira sin enviar', async () => {
    const fix = reportFixture();
    fix.campaign.template = null as never;
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(fix);

    await expect(
      worker.process(jobOf({ reportId: 'rep-1', organizationId: 'org-a', teamId: 'team-a' })),
    ).rejects.toThrow(/no template/);
    expect(senders.sendForAccount).not.toHaveBeenCalled();
  });
});
