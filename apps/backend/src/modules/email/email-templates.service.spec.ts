import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let templateMock: Record<string, jest.Mock>;
  let smtpMock: Record<string, jest.Mock>;

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        {
          provide: PrismaService,
          useValue: { scoped: { emailTemplate: templateMock, smtpAccount: smtpMock } },
        },
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
});
