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
  let prismaScoped: { emailReport: { findFirst: jest.Mock; update: jest.Mock } };
  let senders: { sendForAccount: jest.Mock };
  let worker: EmailWorkerService;

  beforeEach(() => {
    prismaScoped = {
      emailReport: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    senders = { sendForAccount: jest.fn() };
    worker = new EmailWorkerService(
      new ConfigService({}),
      { scoped: prismaScoped } as never,
      senders as never,
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
    expect(sendArgs.html).toBe('<p>Hi Ana</p>');

    expect(prismaScoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({
        status: 'SENT',
        smtpMessageId: 'msg-x',
        subject: 'Hola Ana',
        html: '<p>Hi Ana</p>',
        error: null,
      }),
    });
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
  });

  it('report no encontrado (cross-tenant via prisma.scoped) → tira sin tocar sender', async () => {
    prismaScoped.emailReport.findFirst.mockResolvedValueOnce(null);

    await expect(
      worker.process(jobOf({ reportId: 'rep-x', organizationId: 'org-b', teamId: 'team-b' })),
    ).rejects.toThrow(/not found in tenant/);

    expect(senders.sendForAccount).not.toHaveBeenCalled();
    expect(prismaScoped.emailReport.update).not.toHaveBeenCalled();
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
