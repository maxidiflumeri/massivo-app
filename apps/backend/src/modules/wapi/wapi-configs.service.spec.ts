import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
      wapiConfig: {
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
    prismaMock.wapiConfig.findFirst.mockResolvedValue({ id: 'c1', phoneNumberId: '123' });

    const res = await TenantContext.run(mockCtx, () => service.findOne('c1'));
    expect(res.id).toBe('c1');
    expect(prismaMock.wapiConfig.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('findOne lanza NotFoundException si no lo encuentra en el scope', async () => {
    prismaMock.wapiConfig.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.findOne('c1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create inyecta data y llama a Prisma', async () => {
    prismaMock.wapiConfig.create.mockResolvedValue({ id: 'new-c1', phoneNumberId: '123' });

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
    expect(prismaMock.wapiConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phoneNumberId: '123',
        accessTokenEnc: 'enc(abc)',
        webhookVerifyTokenEnc: 'enc(def)',
      }),
    });
  });

  it('delete valida existencia antes de eliminar', async () => {
    prismaMock.wapiConfig.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.remove('c1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.wapiConfig.delete).not.toHaveBeenCalled();
  });
});
