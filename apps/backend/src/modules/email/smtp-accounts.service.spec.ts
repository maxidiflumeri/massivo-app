import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SmtpAccountsService } from './smtp-accounts.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailSenderService } from './sender/email-sender.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('SmtpAccountsService', () => {
  let service: SmtpAccountsService;
  let prismaScopedMock: Record<string, jest.Mock>;
  let senderMock: { sendForAccount: jest.Mock; verifyAccount: jest.Mock };

  const tenantA: RequestContext = {
    userId: 'user-a',
    organizationId: 'org-a',
    teamId: 'team-a1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    prismaScopedMock = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    senderMock = {
      sendForAccount: jest.fn(),
      verifyAccount: jest.fn().mockResolvedValue({ ok: true }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SmtpAccountsService,
        {
          provide: PrismaService,
          useValue: { scoped: { smtpAccount: prismaScopedMock } },
        },
        {
          provide: EmailSenderService,
          useValue: senderMock,
        },
      ],
    }).compile();

    service = moduleRef.get(SmtpAccountsService);
  });

  it('findAll lanza ForbiddenException sin contexto', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAll usa prisma.scoped (la extension inyecta orgId+teamId)', async () => {
    await TenantContext.run(tenantA, () => service.findAll());
    expect(prismaScopedMock['findMany']).toHaveBeenCalledTimes(1);
  });

  it('findOne devuelve NotFoundException si no existe en el scope', async () => {
    prismaScopedMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.findOne('id-de-otro-tenant')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  const fakeAccountRow = (overrides: Record<string, unknown> = {}) => ({
    id: 's1',
    name: 'n',
    teamId: 'team-a1',
    host: 'h',
    port: 587,
    username: 'u',
    passwordEnc: 'pwd',
    fromName: 'fn',
    fromEmail: 'a@b.com',
    provider: 'smtp',
    sesConfigSet: null,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it('create no pasa orgId/teamId en data, isActive=false hasta verify', async () => {
    prismaScopedMock['create']!.mockResolvedValue(fakeAccountRow());
    prismaScopedMock['update']!.mockResolvedValue(fakeAccountRow({ isActive: true }));

    await TenantContext.run(tenantA, () =>
      service.create({
        name: 'n',
        host: 'h',
        port: 587,
        username: 'u',
        password: 'pwd',
        fromName: 'fn',
        fromEmail: 'a@b.com',
      }),
    );

    const args = prismaScopedMock['create']!.mock.calls[0][0];
    expect(args.data.organizationId).toBeUndefined();
    expect(args.data.teamId).toBeUndefined();
    expect(args.data.passwordEnc).toBe('pwd');
    expect(args.data.isActive).toBe(false);
  });

  it('create activa la cuenta si verifyAccount pasa', async () => {
    prismaScopedMock['create']!.mockResolvedValue(fakeAccountRow());
    prismaScopedMock['update']!.mockResolvedValue(fakeAccountRow({ isActive: true }));
    senderMock.verifyAccount.mockResolvedValue({ ok: true });

    const res = await TenantContext.run(tenantA, () =>
      service.create({
        name: 'n', host: 'h', port: 587, username: 'u', password: 'pwd',
        fromName: 'fn', fromEmail: 'a@b.com',
      }),
    );

    expect(res.verify).toEqual({ ok: true });
    expect(res.account.isActive).toBe(true);
    expect(prismaScopedMock['update']).toHaveBeenCalledTimes(1);
    const updateArgs = prismaScopedMock['update']!.mock.calls[0][0];
    expect(updateArgs.data).toEqual({ isActive: true });
  });

  it('create deja la cuenta inactiva si verifyAccount falla', async () => {
    prismaScopedMock['create']!.mockResolvedValue(fakeAccountRow());
    senderMock.verifyAccount.mockResolvedValue({ ok: false, error: 'Invalid login' });

    const res = await TenantContext.run(tenantA, () =>
      service.create({
        name: 'n', host: 'h', port: 587, username: 'u', password: 'pwd',
        fromName: 'fn', fromEmail: 'a@b.com',
      }),
    );

    expect(res.verify).toEqual({ ok: false, error: 'Invalid login' });
    expect(res.account.isActive).toBe(false);
    expect(prismaScopedMock['update']).not.toHaveBeenCalled();
  });

  describe('verify (re-verificación bajo demanda)', () => {
    it('NotFoundException si la cuenta no existe', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => service.verify('id-no-existe')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(senderMock.verifyAccount).not.toHaveBeenCalled();
    });

    it('activa una cuenta inactiva si pasa verify', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(fakeAccountRow({ isActive: false }));
      prismaScopedMock['update']!.mockResolvedValue(fakeAccountRow({ isActive: true }));
      senderMock.verifyAccount.mockResolvedValue({ ok: true });

      const res = await TenantContext.run(tenantA, () => service.verify('s1'));
      expect(res.verify.ok).toBe(true);
      expect(res.account.isActive).toBe(true);
    });

    it('desactiva una cuenta activa si verify falla', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(fakeAccountRow({ isActive: true }));
      prismaScopedMock['update']!.mockResolvedValue(fakeAccountRow({ isActive: false }));
      senderMock.verifyAccount.mockResolvedValue({ ok: false, error: 'AUTH failed' });

      const res = await TenantContext.run(tenantA, () => service.verify('s1'));
      expect(res.verify).toEqual({ ok: false, error: 'AUTH failed' });
      expect(res.account.isActive).toBe(false);
    });
  });

  describe('testSend', () => {
    const account = {
      id: 'acc-1',
      teamId: 'team-a1',
      name: 'Cuenta Test',
      host: 'smtp.example.com',
      port: 587,
      username: 'u',
      passwordEnc: 'pwd',
      fromName: 'Massivo',
      fromEmail: 'no-reply@example.com',
      provider: 'smtp',
      sesConfigSet: null,
      isActive: true,
    };

    it('envía email de prueba y retorna messageId', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(account);
      senderMock.sendForAccount.mockResolvedValue({ messageId: 'msg-1', provider: 'smtp' });

      const result = await TenantContext.run(tenantA, () =>
        service.testSend('acc-1', { to: 'dest@example.com' }),
      );

      expect(result).toEqual({ ok: true, messageId: 'msg-1' });
      expect(senderMock.sendForAccount).toHaveBeenCalledTimes(1);
    });

    it('NotFoundException si la cuenta no existe en el scope', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () =>
          service.testSend('acc-X', { to: 'dest@example.com' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(senderMock.sendForAccount).not.toHaveBeenCalled();
    });

    it('BadRequestException si la cuenta está deshabilitada', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue({ ...account, isActive: false });
      await expect(
        TenantContext.run(tenantA, () =>
          service.testSend('acc-1', { to: 'dest@example.com' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(senderMock.sendForAccount).not.toHaveBeenCalled();
    });

    it('BadRequestException si el sender falla', async () => {
      prismaScopedMock['findFirst']!.mockResolvedValue(account);
      senderMock.sendForAccount.mockRejectedValue(new Error('SMTP timeout'));
      await expect(
        TenantContext.run(tenantA, () =>
          service.testSend('acc-1', { to: 'dest@example.com' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('remove valida existencia previa antes de delete', async () => {
    prismaScopedMock['findFirst']!.mockResolvedValue(null);
    await expect(
      TenantContext.run(tenantA, () => service.remove('id-otra-org')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaScopedMock['delete']).not.toHaveBeenCalled();
  });
});
