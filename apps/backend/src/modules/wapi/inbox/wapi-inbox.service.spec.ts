import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { WapiInboxService } from './wapi-inbox.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WhatsAppAdapter } from '../../channels/adapters/whatsapp.adapter';
import { WapiMediaService } from '../media/wapi-media.service';
import { WapiBotEngineService } from '../bot/wapi-bot-engine.service';
import { TenantContext } from '../../../common/auth/tenant-context';

describe('WapiInboxService', () => {
  let service: WapiInboxService;
  let prismaMock: Record<string, any>;
  let senderMock: { sendText: jest.Mock; sendMediaById: jest.Mock };
  let eventsMock: { emitToTeam: jest.Mock };
  let mediaMock: { uploadToMeta: jest.Mock };

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
    senderMock = { sendText: jest.fn(), sendMediaById: jest.fn() };
    // Fase 1b — el inbox envía vía WhatsAppAdapter. Mock que reenvía al senderMock
    // (preserva las aserciones sobre sendText/sendMediaById) + expone capabilities
    // para el guard de ventana de 24h.
    const adapterMock = {
      capabilities: {
        interactiveButtons: { supported: true, max: 3 },
        mediaTypes: ['image', 'video', 'audio', 'document'],
        freeformWindow: { enforced: true, hours: 24 },
        templates: true,
      },
      send: jest.fn(async (conn: unknown, msg: Record<string, unknown>) => {
        const cfg = conn;
        if (msg.kind === 'media') {
          const r = await senderMock.sendMediaById(cfg, {
            to: msg.to,
            type: msg.mediaType,
            mediaId: msg.mediaId,
            caption: msg.caption,
            filename: msg.filename,
          });
          return { externalMessageId: r.metaMessageId };
        }
        const r = await senderMock.sendText(cfg, {
          to: msg.to,
          body: msg.text,
          previewUrl: msg.previewUrl,
        });
        return { externalMessageId: r.metaMessageId };
      }),
    };
    eventsMock = { emitToTeam: jest.fn() };
    mediaMock = { uploadToMeta: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WapiInboxService,
        { provide: PrismaService, useValue: { scoped: prismaMock } },
        { provide: WhatsAppAdapter, useValue: adapterMock },
        { provide: EventsService, useValue: eventsMock },
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn((v: string) => v) },
        },
        { provide: WapiMediaService, useValue: mediaMock },
        {
          provide: WapiBotEngineService,
          useValue: {
            handle: jest.fn().mockResolvedValue({ handled: false }),
            isBotButtonId: jest.fn().mockReturnValue(false),
            endSessionsForConversation: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WapiInboxService);
  });

  it('listConversations filtra por tab=mine: ASSIGNED a mí + WAITING con lastAssignedUserId=mí', async () => {
    prismaMock.wapiConversation.findMany.mockResolvedValue([]);
    await TenantContext.run(ctx, () => service.listConversations({ tab: 'mine' }));
    const args = prismaMock.wapiConversation.findMany.mock.calls[0][0];
    // 4.O.6 — `mine` ahora es OR (ASSIGNED al usuario, WAITING con
    // lastAssignedUserId=usuario). El filtro escalated se aplica siempre.
    expect(args.where.escalated).toBe(true);
    expect(args.where.OR).toEqual([
      { status: 'ASSIGNED', assignedUserId: 'u1' },
      { status: 'WAITING', lastAssignedUserId: 'u1' },
    ]);
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

  it('sendMedia happy path: sube a Meta, persiste con campos media, emite eventos', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      configId: 'cfg1',
      phone: '+5491112345678',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      window24hAt: new Date(Date.now() + 60_000),
      firstReplyAt: new Date(),
    });
    prismaMock.wapiConfig.findFirst.mockResolvedValue({
      id: 'cfg1',
      phoneNumberId: 'pn1',
      accessTokenEnc: 'token',
      isActive: true,
    });
    mediaMock.uploadToMeta.mockResolvedValue({
      mediaId: 'meta-id-7',
      sha256: 'a'.repeat(64),
      size: 1024,
      localPath: 'org1/team1/aaa.jpg',
    });
    senderMock.sendMediaById.mockResolvedValue({ metaMessageId: 'wamid.media.x' });
    prismaMock.wapiMessage.create.mockResolvedValue({
      id: 'msg-media-1',
      content: { image: { id: 'meta-id-7' } },
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      lastMessageAt: new Date(),
    });

    const out = await TenantContext.run(ctx, () =>
      service.sendMedia(
        'c1',
        { type: 'image', caption: 'mira esto' },
        {
          buffer: Buffer.from([0xff, 0xd8, 0xff]),
          mimetype: 'image/jpeg',
          originalname: 'foto.jpg',
          size: 3,
        },
      ),
    );

    expect(out.metaMessageId).toBe('wamid.media.x');
    expect(mediaMock.uploadToMeta).toHaveBeenCalledWith(
      expect.objectContaining({ configId: 'cfg1', type: 'image', mime: 'image/jpeg' }),
    );
    expect(prismaMock.wapiMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'image',
          mediaId: 'meta-id-7',
          mediaSha256: 'a'.repeat(64),
          mediaCaption: 'mira esto',
        }),
      }),
    );
  });

  it('listMessages 404 si la conversación no existe', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue(null);
    await expect(
      TenantContext.run(ctx, () => service.listMessages('c1', {})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // -- 4.O.6: bot suspension + WAITING ----------------------------------------

  it('listConversations: filtra escalated=true en cualquier tab', async () => {
    prismaMock.wapiConversation.findMany.mockResolvedValue([]);
    await TenantContext.run(ctx, () => service.listConversations({ tab: 'all' }));
    const args = prismaMock.wapiConversation.findMany.mock.calls[0][0];
    expect(args.where.escalated).toBe(true);
    expect(args.where.status).toEqual({ in: ['UNASSIGNED', 'ASSIGNED', 'WAITING'] });
  });

  it('assign suspende el bot, escala y guarda lastAssignedUserId', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'UNASSIGNED',
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u9',
    });

    await TenantContext.run(ctx, () => service.assign('c1', 'u9'));

    expect(prismaMock.wapiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          assignedUserId: 'u9',
          status: 'ASSIGNED',
          botSuspended: true,
          escalated: true,
          waitingUntil: null,
          lastAssignedUserId: 'u9',
        }),
      }),
    );
  });

  it('resolve libera al bot y limpia waitingUntil', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      assignedUserId: 'u1',
      resolvedAt: new Date(),
    });

    await TenantContext.run(ctx, () => service.resolve('c1', {}));

    expect(prismaMock.wapiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED',
          botSuspended: false,
          waitingUntil: null,
        }),
      }),
    );
  });

  it('putOnHold: ASSIGNED → WAITING con TTL del cfg, libera assignedUserId', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T12:00:00.000Z'));
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      configId: 'cfg1',
    });
    prismaMock.wapiConfig.findFirst.mockResolvedValue({ botWaitingTtlMin: 90 });
    prismaMock.wapiConversation.update.mockResolvedValue({
      id: 'c1',
      status: 'WAITING',
      assignedUserId: null,
    });

    const out = await TenantContext.run(ctx, () => service.putOnHold('c1'));

    expect(out.waitingUntil).toEqual(new Date('2026-05-06T13:30:00.000Z'));
    expect(prismaMock.wapiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'WAITING',
          waitingUntil: new Date('2026-05-06T13:30:00.000Z'),
          lastAssignedUserId: 'u1',
          assignedUserId: null,
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('putOnHold rechaza conversaciones que no estén en ASSIGNED', async () => {
    prismaMock.wapiConversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'UNASSIGNED',
      assignedUserId: null,
      configId: 'cfg1',
    });
    await expect(
      TenantContext.run(ctx, () => service.putOnHold('c1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
