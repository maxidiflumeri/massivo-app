import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { WapiQuickRepliesService } from './wapi-quick-replies.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';

describe('WapiQuickRepliesService', () => {
  let service: WapiQuickRepliesService;
  let prismaMock: Record<string, any>;

  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(async () => {
    prismaMock = {
      wapiQuickReply: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WapiQuickRepliesService,
        { provide: PrismaService, useValue: { scoped: prismaMock } },
      ],
    }).compile();

    service = moduleRef.get(WapiQuickRepliesService);
  });

  it('create inyecta createdByUserId del contexto', async () => {
    const now = new Date();
    prismaMock.wapiQuickReply.create.mockResolvedValue({
      id: 'q1',
      shortcut: 'saludo',
      body: 'Hola!',
      createdByUserId: 'u1',
      createdAt: now,
      updatedAt: now,
    });

    const res = await TenantContext.run(ctx, () =>
      service.create({ shortcut: 'saludo', body: 'Hola!' }),
    );

    expect(res.shortcut).toBe('saludo');
    expect(prismaMock.wapiQuickReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shortcut: 'saludo',
        body: 'Hola!',
        createdByUserId: 'u1',
      }),
    });
  });

  it('create lanza Conflict si ya existe el shortcut (P2002)', async () => {
    prismaMock.wapiQuickReply.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      TenantContext.run(ctx, () => service.create({ shortcut: 'saludo', body: 'x' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update valida existencia antes de actualizar', async () => {
    prismaMock.wapiQuickReply.findFirst.mockResolvedValue(null);
    await expect(
      TenantContext.run(ctx, () => service.update('q1', { body: 'nuevo' })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.wapiQuickReply.update).not.toHaveBeenCalled();
  });

  it('remove valida existencia antes de borrar', async () => {
    prismaMock.wapiQuickReply.findFirst.mockResolvedValue(null);
    await expect(
      TenantContext.run(ctx, () => service.remove('q1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.wapiQuickReply.delete).not.toHaveBeenCalled();
  });
});
