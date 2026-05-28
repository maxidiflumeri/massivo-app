import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailSenderService } from './sender/email-sender.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { CONTACT_BASE_VARIABLES } from './email-template-variables';
import type { RequestContext } from '@massivo/shared-types';

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let templateMock: Record<string, jest.Mock>;
  let smtpMock: Record<string, jest.Mock>;
  let queryRawMock: jest.Mock;
  let senderMock: { sendForAccount: jest.Mock };

  const tenantA: RequestContext = {
    userId: 'user-a',
    organizationId: 'org-a',
    teamId: 'team-a1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    templateMock = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    smtpMock = { findFirst: jest.fn() };
    queryRawMock = jest.fn().mockResolvedValue([]);
    senderMock = { sendForAccount: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        {
          provide: PrismaService,
          useValue: {
            scoped: { emailTemplate: templateMock, smtpAccount: smtpMock },
            $queryRaw: queryRawMock,
          },
        },
        { provide: EmailSenderService, useValue: senderMock },
      ],
    }).compile();

    service = moduleRef.get(EmailTemplatesService);
  });

  it('findAll sin contexto → ForbiddenException', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne de template inexistente en scope → NotFoundException', async () => {
    templateMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.findOne('id-otro')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rechaza smtpAccountId fuera del scope', async () => {
    smtpMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () =>
        service.create({
          name: 't',
          subject: 's',
          html: '<p/>',
          design: { body: {} },
          smtpAccountId: 'smtp-de-otro-team',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(templateMock['create']).not.toHaveBeenCalled();
  });

  it('create exitoso: confía en la extension para inyectar tenant', async () => {
    smtpMock['findFirst']!.mockResolvedValue({ id: 'smtp-1' });
    templateMock['create']!.mockResolvedValue({
      id: 't1',
      name: 't',
      subject: 's',
      smtpAccountId: 'smtp-1',
      html: '<p/>',
      design: { body: {} },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await TenantContext.run(tenantA, () =>
      service.create({
        name: 't',
        subject: 's',
        html: '<p/>',
        design: { body: {} },
        smtpAccountId: 'smtp-1',
      }),
    );

    const args = templateMock['create']!.mock.calls[0][0];
    expect(args.data.organizationId).toBeUndefined();
    expect(args.data.teamId).toBeUndefined();
    expect(args.data.smtpAccountId).toBe('smtp-1');
  });

  it('remove de template ajeno → NotFoundException, no llama delete', async () => {
    templateMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.remove('t-otro')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(templateMock['delete']).not.toHaveBeenCalled();
  });

  describe('getVariablesCatalog', () => {
    it('template inexistente → NotFoundException', async () => {
      templateMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.getVariablesCatalog('t-x')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('sin campañas previas devuelve solo base, custom vacío', async () => {
      templateMock['findFirst']!.mockResolvedValue({ id: 't1' });
      queryRawMock.mockResolvedValue([]);
      const out = await TenantContext.run(tenantA, () => service.getVariablesCatalog('t1'));
      expect(out.base).toEqual(CONTACT_BASE_VARIABLES);
      expect(out.custom).toEqual([]);
    });

    it('custom keys descubiertas + ordenadas alfa + base-keys filtradas', async () => {
      templateMock['findFirst']!.mockResolvedValue({ id: 't1' });
      queryRawMock.mockResolvedValue([
        { key: 'orderId' },
        { key: 'totalAmount' },
        { key: 'firstName' }, // base — debería filtrarse
        { key: 'apellido' },
        { key: 'orderId' }, // dup — debería deduplicarse
      ]);
      const out = await TenantContext.run(tenantA, () => service.getVariablesCatalog('t1'));
      expect(out.custom.map((c) => c.key)).toEqual(['apellido', 'orderId', 'totalAmount']);
      // Sanity: ninguna key base aparece en custom.
      expect(out.custom.some((c) => c.key === 'firstName')).toBe(false);
    });
  });

  describe('renderPreview', () => {
    it('template inexistente → NotFoundException', async () => {
      templateMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.renderPreview('t-x', {})),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sin sampleData usa los samples del catálogo base', async () => {
      templateMock['findFirst']!.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{firstName}}',
        html: '<p>{{firstName}} {{lastName}}</p>',
      });
      const out = await TenantContext.run(tenantA, () => service.renderPreview('t1', {}));
      expect(out.subject).toBe('Hola Juan');
      expect(out.html).toBe('<p>Juan Pérez</p>');
    });

    it('sampleData del usuario gana sobre defaults del catálogo', async () => {
      templateMock['findFirst']!.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{firstName}} (#{{orderId}})',
        html: '<p>{{firstName}}</p>',
      });
      const out = await TenantContext.run(tenantA, () =>
        service.renderPreview('t1', { sampleData: { firstName: 'Ana', orderId: 'PED-9' } }),
      );
      expect(out.subject).toBe('Hola Ana (#PED-9)');
      expect(out.html).toBe('<p>Ana</p>');
    });
  });

  describe('sendTest', () => {
    it('template inexistente → NotFoundException', async () => {
      templateMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.sendTest('t-x', { toEmail: 'a@b.com' })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(senderMock.sendForAccount).not.toHaveBeenCalled();
    });

    it('sin SMTP configurado en el team → BadRequestException', async () => {
      templateMock['findFirst']!.mockResolvedValue({
        id: 't1',
        subject: 's',
        html: '<p/>',
        smtpAccountId: null,
      });
      smtpMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.sendTest('t1', { toEmail: 'a@b.com' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(senderMock.sendForAccount).not.toHaveBeenCalled();
    });

    it('happy path: usa smtpAccountId del template y llama al sender con args correctos', async () => {
      templateMock['findFirst']!.mockResolvedValue({
        id: 't1',
        subject: 'Hola {{firstName}}',
        html: '<p>{{firstName}}</p>',
        smtpAccountId: 'smtp-1',
      });
      // 1ra llamada: assertSmtpAccountInScope. 2da: findFirst para usar el row.
      smtpMock['findFirst']!
        .mockResolvedValueOnce({ id: 'smtp-1' })
        .mockResolvedValueOnce({
          id: 'smtp-1',
          teamId: 'team-a1',
          host: 'h',
          port: 587,
          username: 'u',
          passwordEnc: 'p',
          fromName: 'N',
          fromEmail: 'n@x',
          provider: 'smtp',
          sesConfigSet: null,
          isActive: true,
        });
      senderMock.sendForAccount.mockResolvedValue({ messageId: 'msg-123' });

      const out = await TenantContext.run(tenantA, () =>
        service.sendTest('t1', { toEmail: 'dest@ejemplo.com' }),
      );

      expect(out).toEqual({ ok: true, smtpAccountId: 'smtp-1', messageId: 'msg-123' });
      expect(senderMock.sendForAccount).toHaveBeenCalledTimes(1);
      const [account, input] = senderMock.sendForAccount.mock.calls[0];
      expect(account.id).toBe('smtp-1');
      expect(input.to).toBe('dest@ejemplo.com');
      expect(input.subject).toBe('Hola Juan');
      expect(input.html).toBe('<p>Juan</p>');
    });
  });
});
