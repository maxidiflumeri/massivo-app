import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '@massivo/shared-types';
import { InboxService } from './inbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { EventsService } from '../events/events.service';
import { ChannelAdapterRegistry } from '../channels/channel-adapter.registry';
import { WapiMediaService } from '../wapi/media/wapi-media.service';
import { BotEngineService } from '../bot/bot-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { ConversationEpisodeService } from '../../common/episodes/conversation-episode.service';

describe('InboxService', () => {
  let service: InboxService;
  let prismaMock: Record<string, any>;
  let senderMock: { sendText: jest.Mock; sendMediaById: jest.Mock };
  let eventsMock: { emitToTeam: jest.Mock };
  let mediaMock: { uploadToMeta: jest.Mock };
  let userMock: { findMany: jest.Mock };

  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(async () => {
    prismaMock = {
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      channel: { findFirst: jest.fn() },
      botSession: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    userMock = { findMany: jest.fn().mockResolvedValue([]) };
    mediaMock = { uploadToMeta: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InboxService,
        { provide: PrismaService, useValue: { scoped: prismaMock, user: userMock } },
        {
          provide: ChannelAdapterRegistry,
          useValue: { get: () => adapterMock, capabilities: () => adapterMock.capabilities, has: () => true },
        },
        { provide: EventsService, useValue: eventsMock },
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn((v: string) => v) },
        },
        { provide: WapiMediaService, useValue: mediaMock },
        {
          provide: BotEngineService,
          useValue: {
            handle: jest.fn().mockResolvedValue({ handled: false }),
            isBotButtonId: jest.fn().mockReturnValue(false),
            endSessionsForConversation: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyInbound: jest.fn().mockResolvedValue(undefined),
            notifyEscalation: jest.fn().mockResolvedValue(undefined),
            notifyAssigned: jest.fn().mockResolvedValue(undefined),
            clearUnassignedForConversation: jest.fn().mockResolvedValue(undefined),
            clearForConversationUser: jest.fn().mockResolvedValue(undefined),
            clearAllForConversation: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // Monitoreo — visitas: stub, no persiste.
          provide: ConversationEpisodeService,
          useValue: {
            resolveFor: jest.fn().mockResolvedValue('ep-test'),
            newEpisodeId: () => 'ep-test',
          },
        },
      ],
    }).compile();

    service = moduleRef.get(InboxService);
  });

  it('listConversations filtra por tab=mine: ASSIGNED a mí + WAITING con lastAssignedUserId=mí', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);
    await TenantContext.run(ctx, () => service.listConversations({ tab: 'mine' }));
    const args = prismaMock.conversation.findMany.mock.calls[0][0];
    // 4.O.6 — `mine` ahora es OR (ASSIGNED al usuario, WAITING con
    // lastAssignedUserId=usuario). El filtro escalated se aplica siempre.
    expect(args.where.escalated).toBe(true);
    expect(args.where.OR).toEqual([
      { status: 'ASSIGNED', assignedUserId: 'u1' },
      { status: 'WAITING', lastAssignedUserId: 'u1' },
    ]);
  });

  it('listConversations: el preview de un menú del bot es texto, nunca el objeto crudo', async () => {
    // Regresión — `interactive.body` es `{ text }`, no un string. Devolverlo tal
    // cual hacía que React tirara "Objects are not valid as a React child" y se
    // fuera a blanco Monitoreo, que sí lista las conversaciones del bot.
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        channelId: 'cfg1',
        channelKind: 'WHATSAPP',
        externalUserId: '549110000',
        name: null,
        status: 'UNASSIGNED',
        assignedUserId: null,
        lastMessageAt: new Date(),
        freeformWindowAt: null,
        unreadCount: 0,
        campaignName: null,
        resolvedAt: null,
        priority: false,
        waitingUntil: null,
        lastAssignedUserId: null,
        escalated: false,
        messages: [
          {
            fromMe: true,
            type: 'interactive',
            timestamp: new Date(),
            content: {
              interactive: {
                type: 'button',
                body: { text: '¿Cómo querés consultar tus infracciones?' },
                action: { buttons: [{ reply: { id: 'bot:dni', title: 'Por DNI' } }] },
              },
            },
          },
        ],
      },
    ]);
    const res = await TenantContext.run(ctx, () =>
      service.listConversations({ includeBotHandled: true }),
    );
    expect(res.items[0]!.lastMessage!.preview).toBe('¿Cómo querés consultar tus infracciones?');
    expect(typeof res.items[0]!.lastMessage!.preview).toBe('string');
    expect(res.items[0]!.escalated).toBe(false);
  });

  it('sendText falla si la ventana 24h está cerrada', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      channelId: 'cfg1',
      externalUserId: '+5491112345678',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      freeformWindowAt: new Date(Date.now() - 60_000),
      firstReplyAt: null,
    });
    await expect(
      TenantContext.run(ctx, () => service.sendText('c1', { body: 'hola' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(senderMock.sendText).not.toHaveBeenCalled();
  });

  it('sendText falla si la conversación está RESOLVED', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      freeformWindowAt: new Date(Date.now() + 60_000),
    });
    await expect(
      TenantContext.run(ctx, () => service.sendText('c1', { body: 'hola' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sendText feliz: persiste mensaje + reasigna si UNASSIGNED + emite eventos', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      channelId: 'cfg1',
      externalUserId: '+5491112345678',
      status: 'UNASSIGNED',
      assignedUserId: null,
      freeformWindowAt: new Date(Date.now() + 60_000),
      firstReplyAt: null,
    });
    prismaMock.channel.findFirst.mockResolvedValue({
      id: 'cfg1',
      phoneNumberId: 'pn1',
      accessTokenEnc: 'token',
      isActive: true,
    });
    senderMock.sendText.mockResolvedValue({ metaMessageId: 'wamid.x' });
    prismaMock.message.create.mockResolvedValue({
      id: 'msg1',
      content: { text: { body: 'hola' } },
    });
    prismaMock.conversation.update.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      lastMessageAt: new Date(),
    });

    const res = await TenantContext.run(ctx, () =>
      service.sendText('c1', { body: 'hola' }),
    );

    expect(res.externalId).toBe('wamid.x');
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ASSIGNED', assignedUserId: 'u1' }),
      }),
    );
    expect(eventsMock.emitToTeam).toHaveBeenCalledWith(
      'team1',
      'conversation.message.new',
      expect.any(Object),
    );
  });

  it('resolve persiste WapiResolutionNote si viene nota', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.conversation.update.mockResolvedValue({
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
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.conversation.update.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      resolvedAt: new Date(),
      assignedUserId: 'u1',
    });

    await TenantContext.run(ctx, () => service.resolve('c1', {}));
    expect(prismaMock.wapiResolutionNote.create).not.toHaveBeenCalled();
  });

  it('reopen falla si la conversación no está RESOLVED', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
    });
    await expect(
      TenantContext.run(ctx, () => service.reopen('c1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sendMedia happy path: sube a Meta, persiste con campos media, emite eventos', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      channelId: 'cfg1',
      externalUserId: '+5491112345678',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      freeformWindowAt: new Date(Date.now() + 60_000),
      firstReplyAt: new Date(),
    });
    prismaMock.channel.findFirst.mockResolvedValue({
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
    prismaMock.message.create.mockResolvedValue({
      id: 'msg-media-1',
      content: { image: { id: 'meta-id-7' } },
    });
    prismaMock.conversation.update.mockResolvedValue({
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

    expect(out.externalId).toBe('wamid.media.x');
    expect(mediaMock.uploadToMeta).toHaveBeenCalledWith(
      expect.objectContaining({ configId: 'cfg1', type: 'image', mime: 'image/jpeg' }),
    );
    expect(prismaMock.message.create).toHaveBeenCalledWith(
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
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    await expect(
      TenantContext.run(ctx, () => service.listMessages('c1', {})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // -- 4.O.6: bot suspension + WAITING ----------------------------------------

  it('listConversations: filtra escalated=true en cualquier tab', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);
    await TenantContext.run(ctx, () => service.listConversations({ tab: 'all' }));
    const args = prismaMock.conversation.findMany.mock.calls[0][0];
    expect(args.where.escalated).toBe(true);
    expect(args.where.status).toEqual({ in: ['UNASSIGNED', 'ASSIGNED', 'WAITING'] });
  });

  it('assign suspende el bot, escala y guarda lastAssignedUserId', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'UNASSIGNED',
    });
    prismaMock.conversation.update.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u9',
    });

    await TenantContext.run(ctx, () => service.assign('c1', 'u9'));

    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
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
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
    });
    prismaMock.conversation.update.mockResolvedValue({
      id: 'c1',
      status: 'RESOLVED',
      assignedUserId: 'u1',
      resolvedAt: new Date(),
    });

    await TenantContext.run(ctx, () => service.resolve('c1', {}));

    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
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
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'ASSIGNED',
      assignedUserId: 'u1',
      channelId: 'cfg1',
    });
    prismaMock.channel.findFirst.mockResolvedValue({ botWaitingTtlMin: 90 });
    prismaMock.conversation.update.mockResolvedValue({
      id: 'c1',
      status: 'WAITING',
      assignedUserId: null,
    });

    const out = await TenantContext.run(ctx, () => service.putOnHold('c1'));

    expect(out.waitingUntil).toEqual(new Date('2026-05-06T13:30:00.000Z'));
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(
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
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c1',
      status: 'UNASSIGNED',
      assignedUserId: null,
      channelId: 'cfg1',
    });
    await expect(
      TenantContext.run(ctx, () => service.putOnHold('c1')),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('listResolutionNotes resuelve el nombre del autor (null = sistema)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c1' });
    prismaMock.wapiResolutionNote.findMany.mockResolvedValue([
      { id: 'n2', note: 'auto', authorUserId: null, createdAt: new Date() },
      { id: 'n1', note: 'listo', authorUserId: 'u1', createdAt: new Date() },
      { id: 'n0', note: 'otra', authorUserId: 'u2', createdAt: new Date() },
    ]);
    userMock.findMany.mockResolvedValue([
      { id: 'u1', name: 'Maxi', email: 'maxi@x.com' },
      { id: 'u2', name: null, email: 'ana@x.com' },
    ]);
    const res = await TenantContext.run(ctx, () => service.listResolutionNotes('c1'));
    expect(userMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['u1', 'u2'] } } }),
    );
    expect(res.map((n) => n.authorName)).toEqual([null, 'Maxi', 'ana@x.com']);
  });

  describe('closeIdleBotSession (inactividad del lado del bot)', () => {
    const conv = {
      id: 'c1',
      channelId: 'ch1',
      channelKind: 'WHATSAPP',
      externalUserId: '549111',
      botSuspended: false,
      lastMessageAt: new Date(Date.now() - 125 * 60_000),
      freeformWindowAt: new Date(Date.now() + 60 * 60_000),
    };

    beforeEach(() => {
      prismaMock.botSession.findFirst.mockResolvedValue({ channelId: 'ch1', externalUserId: '549111' });
      prismaMock.conversation.findFirst.mockResolvedValue(conv);
      prismaMock.channel.findFirst.mockResolvedValue({ id: 'ch1', isActive: true, phoneNumberId: 'pn', accessTokenEnc: 'tok' });
      prismaMock.message.create.mockResolvedValue({ id: 'm-bye' });
      senderMock.sendText.mockResolvedValue({ metaMessageId: 'wamid.bye' });
    });

    it('cierra la sesión por inactividad y manda la despedida sin tocar la conversación', async () => {
      const ok = await TenantContext.run(ctx, () =>
        service.closeIdleBotSession('s1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(true);
      expect(prismaMock.botSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', endedAt: null, lastInboundAt: { lt: expect.any(Date) } },
        data: { endedAt: expect.any(Date), endedReason: 'inactivity' },
      });
      expect(senderMock.sendText).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ to: '549111', body: 'chau' }),
      );
      expect(prismaMock.conversation.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.wapiResolutionNote.create).not.toHaveBeenCalled();
    });

    it('si el cliente escribió hace poco (texto libre en un menú), no cierra', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({ ...conv, lastMessageAt: new Date() });
      const ok = await TenantContext.run(ctx, () =>
        service.closeIdleBotSession('s1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(false);
      expect(prismaMock.botSession.updateMany).not.toHaveBeenCalled();
      expect(senderMock.sendText).not.toHaveBeenCalled();
    });

    it('con un humano a cargo no hace nada (lo cubre el cierre del lado humano)', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({ ...conv, botSuspended: true });
      const ok = await TenantContext.run(ctx, () =>
        service.closeIdleBotSession('s1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(false);
      expect(prismaMock.botSession.updateMany).not.toHaveBeenCalled();
    });

    it('si otra instancia ya la cerró, no manda nada', async () => {
      prismaMock.botSession.updateMany.mockResolvedValueOnce({ count: 0 });
      const ok = await TenantContext.run(ctx, () =>
        service.closeIdleBotSession('s1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(false);
      expect(senderMock.sendText).not.toHaveBeenCalled();
    });

    it('sin despedida configurada: sólo cierra la sesión', async () => {
      const ok = await TenantContext.run(ctx, () =>
        service.closeIdleBotSession('s1', { afterMin: 120, message: null }),
      );
      expect(ok).toBe(true);
      expect(senderMock.sendText).not.toHaveBeenCalled();
    });
  });

  describe('autoCloseInactive (cierre por inactividad)', () => {
    const conv = {
      id: 'c1',
      channelId: 'ch1',
      channelKind: 'WHATSAPP',
      externalUserId: '549111',
      assignedUserId: 'u9',
      status: 'RESOLVED',
      botSuspended: false,
      // 125 min atrás: pasó el TTL de 120 pero dentro del margen para despedirse.
      lastMessageAt: new Date(Date.now() - 125 * 60_000),
      freeformWindowAt: new Date(Date.now() + 60 * 60_000),
    };

    beforeEach(() => {
      prismaMock.conversation.findFirst.mockResolvedValue(conv);
      prismaMock.channel.findFirst.mockResolvedValue({ id: 'ch1', isActive: true, phoneNumberId: 'pn', accessTokenEnc: 'tok' });
      prismaMock.message.create.mockResolvedValue({ id: 'm-bye' });
      senderMock.sendText.mockResolvedValue({ metaMessageId: 'wamid.bye' });
    });

    it('claim condicional: resuelve, libera el bot y deja nota del sistema', async () => {
      const ok = await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: null }),
      );
      expect(ok).toBe(true);
      const args = prismaMock.conversation.updateMany.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({
          id: 'c1',
          status: { not: 'RESOLVED' },
          botSuspended: true,
          lastMessageAt: { lt: expect.any(Date) },
        }),
      );
      expect(args.data).toEqual(
        expect.objectContaining({ status: 'RESOLVED', botSuspended: false, waitingUntil: null }),
      );
      expect(prismaMock.wapiResolutionNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ conversationId: 'c1', authorUserId: null }),
      });
      expect(senderMock.sendText).not.toHaveBeenCalled();
      expect(eventsMock.emitToTeam).toHaveBeenCalledWith(
        'team1',
        'conversation.updated',
        expect.objectContaining({ id: 'c1', status: 'RESOLVED' }),
      );
    });

    it('con despedida: la envía y la persiste marcada como auto-close', async () => {
      await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: '  ¡Gracias por escribirnos!  ' }),
      );
      expect(senderMock.sendText).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ to: '549111', body: '¡Gracias por escribirnos!' }),
      );
      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          externalId: 'wamid.bye',
          fromMe: true,
          content: { text: { body: '¡Gracias por escribirnos!' }, system: { kind: 'auto-close' } },
        }),
      });
      expect(eventsMock.emitToTeam).toHaveBeenCalledWith(
        'team1',
        'conversation.message.new',
        expect.objectContaining({ conversationId: 'c1' }),
      );
    });

    it('si otra instancia ya la cerró (o hubo actividad), no hace nada', async () => {
      prismaMock.conversation.updateMany.mockResolvedValueOnce({ count: 0 });
      const ok = await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(false);
      expect(senderMock.sendText).not.toHaveBeenCalled();
      expect(prismaMock.wapiResolutionNote.create).not.toHaveBeenCalled();
    });

    it('ventana de 24h cerrada: cierra igual pero no manda la despedida', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        ...conv,
        freeformWindowAt: new Date(Date.now() - 60_000),
      });
      const ok = await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(true);
      expect(senderMock.sendText).not.toHaveBeenCalled();
    });

    it('inactividad muy vieja (pasado el margen): cierra sin despedida', async () => {
      prismaMock.conversation.findFirst.mockResolvedValue({
        ...conv,
        lastMessageAt: new Date(Date.now() - 10 * 60 * 60_000),
      });
      const ok = await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(true);
      expect(senderMock.sendText).not.toHaveBeenCalled();
    });

    it('si falla el envío de la despedida, la conversación queda cerrada igual', async () => {
      senderMock.sendText.mockRejectedValueOnce(new Error('Meta caído'));
      const ok = await TenantContext.run(ctx, () =>
        service.autoCloseInactive('c1', { afterMin: 120, message: 'chau' }),
      );
      expect(ok).toBe(true);
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });
  });
});
