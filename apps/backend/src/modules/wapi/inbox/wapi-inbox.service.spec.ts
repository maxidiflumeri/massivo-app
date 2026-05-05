import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { WapiInboxService } from './wapi-inbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import { TenantContext } from '../../../common/auth/tenant-context';

describe('WapiInboxService', () => {
  let service: WapiInboxService;
  let prismaMock: Record<string, any>;
  let senderMock: { sendText: jest.Mock };
  let eventsMock: { emitToTeam: jest.Mock };

  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(async () => {
    prismaMock = {
      wapiConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      wapiMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      wapiConfig: { findFirst: jest.fn() },
      wapiResolutionNote: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    senderMock = { sendText: jest.fn() };
    eventsMock = { emitToTeam: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WapiInboxService,
        { provide: PrismaService, useValue: { scoped: prismaMock } },
        { provide: WapiSenderService, useValue: senderMock },
        { provide: EventsService, useValue: eventsMock },
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn((v: string) => v) },
        },
      ],
    }).compile();

    service = moduleRef.get(WapiInboxService);
  });

  it('listConversations filtra por tab=mine con assignedUserId del ctx', async () => {
    prismaMock.wapiConversation.findMany.mockResolvedValue([]);
    await TenantContext.run(ctx, () => service.listConversations({ tab: 'mine' }));
    const args = prismaMock.wapiConversation.findMany.mock.calls[0][0];
    expect(args.where.assignedUserId).toBe('u1');
  });

  it('sendText falla si la ventana 24h está cerrada', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      configId: 'cfg1',
      phone: '+5491112345678',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      window24hAt: new Date(Date.now() - 60_000),
      firstReplyAt: null,
    });
    await expect(
      TenantContext.run(ctx, () => service.sendText('c1', { body: 'hola' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(senderMock.sendText).not.toHaveBeenCalled();
  });

  it('sendText falla si la conversación está RESOLVED', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      window24hAt: new Date(Date.now() + 60_000),
    });
    await expect(
      TenantContext.run(ctx, () => service.sendText('c1', { body: 'hola' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sendText feliz: persiste mensaje + reasigna si UNASSIGNED + emite eventos', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      configId: 'cfg1',
      phone: '+5491112345678',
      status: 'UNASSIGNED',
      assignedUserId: null,
      window24hAt: new Date(Date.now() + 60_000),
      firstReplyAt: null,
    });
    prismaMock.wapiConfig.findFirst.mockResolvedValue({
      id: 'cfg1',
      phoneNumberId: 'pn1',
      accessTokenEnc: 'token',
      isActive: true,
    });
    senderMock.sendText.mockResolvedValue({ metaMessageId: 'wamid.x' });
    prismaMock.wapiMessage.create.mockResolvedValue({
      id: 'msg1',
      content: { text: { body: 'hola' } },
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      lastMessageAt: new Date(),
    });

    const res = await TenantContext.run(ctx, () =>
      service.sendText('c1', { body: 'hola' }),
    );

    expect(res.metaMessageId).toBe('wamid.x');
    expect(prismaMock.wapiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ASSIGNED', assignedUserId: 'u1' }),
      }),
    );
    expect(eventsMock.emitToTeam).toHaveBeenCalledWith(
      'team1',
      'wapi.message.new',
      expect.any(Object),
    );
  });

  it('resolve persiste WapiResolutionNote si viene nota', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      resolvedAt: new Date(),
      assignedUserId: 'u1',
    });

    await TenantContext.run(ctx, () =>
      service.resolve('c1', { note: 'cerrado por solicitud del cliente' }),
    );

    expect(prismaMock.wapiResolutionNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'c1',
        authorUserId: 'u1',
        note: 'cerrado por solicitud del cliente',
      }),
    });
  });

  it('resolve sin nota no toca WapiResolutionNote', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      resolvedAt: new Date(),
      assignedUserId: 'u1',
    });

    await TenantContext.run(ctx, () => service.resolve('c1', {}));
    expect(prismaMock.wapiResolutionNote.create).not.toHaveBeenCalled();
  });

  it('reopen falla si la conversación no está RESOLVED', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
    });
    await expect(
      TenantContext.run(ctx, () => service.reopen('c1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('listMessages 404 si la conversación no existe', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue(null);
    await expect(
      TenantContext.run(ctx, () => service.listMessages('c1', {})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
