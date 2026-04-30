import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WapiTemplatesService } from './wapi-templates.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('WapiTemplatesService', () => {
  let service: WapiTemplatesService;
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
      wapiTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WapiTemplatesService,
        {
          provide: PrismaService,
          useValue: { scoped: prismaMock },
        },
      ],
    }).compile();

    service = moduleRef.get(WapiTemplatesService);
  });

  it('lanza ForbiddenException si se llama sin contexto', async () => {
    await expect(service.findAll()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne devuelve template si existe', async () => {
    prismaMock.wapiTemplate.findFirst.mockResolvedValue({ id: 't1', metaName: 'hello_world' });

    const res = await TenantContext.run(mockCtx, () => service.findOne('t1'));
    expect(res.id).toBe('t1');
  });

  it('findOne lanza NotFoundException si no lo encuentra en el scope', async () => {
    prismaMock.wapiTemplate.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.findOne('t1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create inyecta data y llama a Prisma', async () => {
    prismaMock.wapiTemplate.create.mockResolvedValue({ id: 'new-t1', metaName: 'promo' });

    const dto = {
      metaName: 'promo',
      category: 'MARKETING',
      language: 'es',
      status: 'APPROVED',
      components: { type: 'BODY', text: 'Hola' },
    };

    const res = await TenantContext.run(mockCtx, () => service.create(dto));
    expect(res.id).toBe('new-t1');
    expect(prismaMock.wapiTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metaName: 'promo',
        status: 'APPROVED',
      }),
    });
  });

  it('delete valida existencia antes de eliminar', async () => {
    prismaMock.wapiTemplate.findFirst.mockResolvedValue(null);

    await expect(
      TenantContext.run(mockCtx, () => service.remove('t1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.wapiTemplate.delete).not.toHaveBeenCalled();
  });
});
