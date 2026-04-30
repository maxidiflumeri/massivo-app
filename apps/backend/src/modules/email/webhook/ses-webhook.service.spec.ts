import { ConfigService } from '@nestjs/config';
import { SesWebhookService } from './ses-webhook.service';
import type { SesEventNotification } from './sns-types';

describe('SesWebhookService', () => {
  let prisma: {
    team: { findUnique: jest.Mock };
    emailReport: { findFirst: jest.Mock };
    scoped: {
      emailReport: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
      emailEvent: { findFirst: jest.Mock; create: jest.Mock };
      emailBounce: { create: jest.Mock };
    };
  };
  let suppression: { addUnsubscribe: jest.Mock };
  let events: { emitToTeamDebounced: jest.Mock };
  let svc: SesWebhookService;

  beforeEach(() => {
    prisma = {
      team: { findUnique: jest.fn() },
      emailReport: { findFirst: jest.fn() },
      scoped: {
        emailReport: {
          findFirst: jest.fn().mockResolvedValue({ id: 'rep-1', campaignId: 'camp-1', contact: { email: 'a@b.com' } }),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
        },
        emailEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
        emailBounce: { create: jest.fn().mockResolvedValue({}) },
      },
    };
    suppression = { addUnsubscribe: jest.fn().mockResolvedValue(undefined) };
    events = { emitToTeamDebounced: jest.fn() };
    svc = new SesWebhookService(
      new ConfigService({ SES_CONFIG_SET_PREFIX: 'massivo-team-' }),
      prisma as never,
      suppression as never,
      events as never,
    );
  });

  function evt(overrides: Partial<SesEventNotification>): SesEventNotification {
    return {
      eventType: 'Open',
      mail: {
        messageId: 'msg-1',
        destination: ['a@b.com'],
        tags: { 'ses:configuration-set': ['massivo-team-team-9'] },
      },
      ...overrides,
    } as SesEventNotification;
  }

  it('resuelve tenant por configuration-set tag', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({ eventType: 'Open', open: { timestamp: 't' } }));
    expect(prisma.team.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'team-9' } }),
    );
    expect(prisma.scoped.emailEvent.create).toHaveBeenCalled();
  });

  it('fallback: sin config-set tag → resuelve por messageId', async () => {
    prisma.emailReport.findFirst.mockResolvedValueOnce({ organizationId: 'org-x', teamId: 'team-9' });
    await svc.process(evt({
      eventType: 'Open', open: { timestamp: 't' },
      mail: { messageId: 'msg-1', destination: ['a@b.com'] },
    }));
    expect(prisma.emailReport.findFirst).toHaveBeenCalled();
    expect(prisma.scoped.emailEvent.create).toHaveBeenCalled();
  });

  it('tenant no resoluble → no toca DB tenant-scoped', async () => {
    prisma.team.findUnique.mockResolvedValueOnce(null);
    prisma.emailReport.findFirst.mockResolvedValueOnce(null);
    await svc.process(evt({ eventType: 'Open' }));
    expect(prisma.scoped.emailEvent.create).not.toHaveBeenCalled();
  });

  it('Bounce permanent → EmailBounce hard + report BOUNCED + suppression GLOBAL', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({
      eventType: 'Bounce',
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: 'a@b.com', diagnosticCode: '550 user unknown' }],
        timestamp: 't',
      },
    }));
    expect(prisma.scoped.emailBounce.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'hard', email: 'a@b.com' }),
    });
    expect(prisma.scoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' }, data: { status: 'BOUNCED' },
    });
    expect(suppression.addUnsubscribe).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b.com', scope: 'GLOBAL', reason: 'ses-bounce-permanent',
    }));
  });

  it('Bounce transient → EmailBounce soft, sin suppression', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({
      eventType: 'Bounce',
      bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'a@b.com' }], timestamp: 't' },
    }));
    expect(prisma.scoped.emailBounce.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'soft' }),
    });
    expect(prisma.scoped.emailReport.update).not.toHaveBeenCalled();
    expect(suppression.addUnsubscribe).not.toHaveBeenCalled();
  });

  it('Complaint → report COMPLAINED + suppression GLOBAL', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({
      eventType: 'Complaint',
      complaint: { complainedRecipients: [{ emailAddress: 'a@b.com' }], timestamp: 't' },
    }));
    expect(prisma.scoped.emailReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' }, data: { status: 'COMPLAINED' },
    });
    expect(suppression.addUnsubscribe).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'GLOBAL', reason: 'ses-complaint',
    }));
  });

  it('Open dedupe: si hay event reciente, no recrea', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    prisma.scoped.emailEvent.findFirst.mockResolvedValueOnce({ id: 'e-old' });
    await svc.process(evt({ eventType: 'Open', open: { timestamp: 't' } }));
    expect(prisma.scoped.emailEvent.create).not.toHaveBeenCalled();
  });

  it('Click registra targetUrl + targetDomain', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({
      eventType: 'Click',
      click: { timestamp: 't', link: 'https://example.com/a?x=1' },
    }));
    expect(prisma.scoped.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CLICK',
        targetUrl: 'https://example.com/a?x=1',
        targetDomain: 'example.com',
      }),
    });
  });

  it('Delivery: no toca scoped (no hay enum DELIVERY)', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({ eventType: 'Delivery', delivery: { timestamp: 't', recipients: ['a@b.com'] } }));
    expect(prisma.scoped.emailEvent.create).not.toHaveBeenCalled();
    expect(prisma.scoped.emailBounce.create).not.toHaveBeenCalled();
    expect(suppression.addUnsubscribe).not.toHaveBeenCalled();
    expect(events.emitToTeamDebounced).not.toHaveBeenCalled();
  });

  it('emite email.report.updated debounced en transiciones (Open/Bounce/Complaint/Click)', async () => {
    prisma.team.findUnique.mockResolvedValueOnce({ id: 'team-9', organizationId: 'org-x' });
    await svc.process(evt({ eventType: 'Open', open: { timestamp: 't' } }));
    expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
      'team-9', 'email.report.updated', 'camp-1', { campaignId: 'camp-1' },
    );
  });
});
