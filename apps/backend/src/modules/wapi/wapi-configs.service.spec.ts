import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WapiConfigsService } from './wapi-configs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EncryptionService } from '../../common/security/encryption.service';
import type { RequestContext } from '@massivo/shared-types';

describe('WapiConfigsService', () => {
  let service: WapiConfigsService;
  let prismaMock: Record<string, any>;

  const mockCtx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    prismaMock = {
      channel: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WapiConfigsService,
        {
          provide: PrismaService,
          useValue: { scoped: prismaMock },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((v: string) => `enc(${v})`),
            decrypt: jest.fn((v: string) => v.replace(/^enc\(|\)$/g, '')),
            isEncrypted: jest.fn((v: string) => v.startsWith('enc(')),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WapiConfigsService);
  });

  it('lanza ForbiddenException si se llama sin contexto', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne devuelve config si existe (contexto inyectado)', async () => {
    prismaMock.channel.findFirst.mockResolvedValue({ id: 'c1', phoneNumberId: '123' });

    const res = await TenantContext.run(mockCtx, () => service.findOne('c1'));
    expect(res.id).toBe('c1');
    expect(prismaMock.channel.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('findOne lanza NotFoundException si no lo encuentra en el scope', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.findOne('c1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create inyecta data y llama a Prisma', async () => {
    prismaMock.channel.create.mockResolvedValue({ id: 'new-c1', phoneNumberId: '123' });

    const dto = {
      name: 'Test',
      phoneNumberId: '123',
      businessAccountId: '456',
      accessToken: 'abc',
      webhookVerifyToken: 'def',
      dailyLimit: 200,
    };

    const res = await TenantContext.run(mockCtx, () => service.create(dto));
    expect(res.id).toBe('new-c1');
    expect(prismaMock.channel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phoneNumberId: '123',
        accessTokenEnc: 'enc(abc)',
        webhookVerifyTokenEnc: 'enc(def)',
      }),
    });
  });

  it('delete valida existencia antes de eliminar', async () => {
    prismaMock.channel.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.remove('c1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.channel.delete).not.toHaveBeenCalled();
  });

  describe('4.Q sendDelay throttle', () => {
    it('create con min>max → BadRequest', async () => {
      const dto = {
        phoneNumberId: '123',
        businessAccountId: '456',
        accessToken: 'a',
        webhookVerifyToken: 'b',
        sendDelayMinMs: 60000,
        sendDelayMaxMs: 30000,
      };
      await expect(
        TenantContext.run(mockCtx, () => service.create(dto)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.channel.create).not.toHaveBeenCalled();
    });

    it('create con min==max OK', async () => {
      prismaMock.channel.create.mockResolvedValue({ id: 'c1', phoneNumberId: '123' });
      const dto = {
        phoneNumberId: '123',
        businessAccountId: '456',
        accessToken: 'a',
        webhookVerifyToken: 'b',
        sendDelayMinMs: 30000,
        sendDelayMaxMs: 30000,
      };
      await TenantContext.run(mockCtx, () => service.create(dto));
      expect(prismaMock.channel.create).toHaveBeenCalled();
    });

    it('update parcial: solo min, contra current.max persistido', async () => {
      prismaMock.channel.findFirst.mockResolvedValue({
        id: 'c1', sendDelayMinMs: 10000, sendDelayMaxMs: 20000,
      });
      prismaMock.channel.update.mockResolvedValue({ id: 'c1', phoneNumberId: '123' });
      // min nuevo (50000) > max persistido (20000) → debe fallar
      await expect(
        TenantContext.run(mockCtx, () => service.update('c1', { sendDelayMinMs: 50000 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.channel.update).not.toHaveBeenCalled();
    });

    it('update parcial: min nuevo válido contra current.max → OK', async () => {
      prismaMock.channel.findFirst.mockResolvedValue({
        id: 'c1', sendDelayMinMs: 10000, sendDelayMaxMs: 60000,
      });
      prismaMock.channel.update.mockResolvedValue({ id: 'c1', phoneNumberId: '123' });
      await TenantContext.run(mockCtx, () =>
        service.update('c1', { sendDelayMinMs: 30000 }),
      );
      expect(prismaMock.channel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sendDelayMinMs: 30000 }),
        }),
      );
    });
  });
});
