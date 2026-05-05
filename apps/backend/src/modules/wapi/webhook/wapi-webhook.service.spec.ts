/**
 * Tests del WapiWebhookService.process. No bootstrappea Nest — instancia el
 * service con prisma + events mockeados.
 *
 * Cubre:
 *  - status delivered → DELIVERED + deliveredAt
 *  - status read → READ + readAt + deliveredAt si no estaba seteado
 *  - status failed → FAILED + errors[0]
 *  - status delivered cuando ya está READ → no retrocede
 *  - status sin report → log y skip
 *  - mensaje inbound nuevo → upsert conversation + crea WapiMessage
 *  - mensaje duplicado (P2002) → swallow
 *  - emite wapi.report.updated y wapi.message.inbound
 *  - multi-config: payload con dos phone_number_ids → cada entry usa su tenant
 */
import { WapiWebhookService, type ResolvedWebhookConfig } from './wapi-webhook.service';
import type { WapiWebhookPayload } from './wapi-webhook.types';

describe('WapiWebhookService', () => {
  const PHONE_ID_A = 'pn-A';
  const cfgA: ResolvedWebhookConfig = {
    organizationId: 'org-a',
    teamId: 'team-a',
    configId: 'cfg-1',
  };
  const mapA = new Map<string, ResolvedWebhookConfig>([[PHONE_ID_A, cfgA]]);

  let prismaScoped: {
    wapiReport: { findFirst: jest.Mock; update: jest.Mock };
    wapiConversation: { upsert: jest.Mock; findFirst: jest.Mock };
    wapiMessage: { create: jest.Mock };
  };
  let events: { emitToTeamDebounced: jest.Mock; emitToTeam: jest.Mock };
  let media: { fetchInboundMedia: jest.Mock };
  let svc: WapiWebhookService;

  beforeEach(() => {
    prismaScoped = {
      wapiReport: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      wapiConversation: {
        upsert: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wapiMessage: { create: jest.fn().mockResolvedValue({}) },
    };
    events = { emitToTeamDebounced: jest.fn(), emitToTeam: jest.fn() };
    media = { fetchInboundMedia: jest.fn() };
    svc = new WapiWebhookService(
      { scoped: prismaScoped } as never,
      events as never,
      media as never,
    );
  });

  function statusPayload(
    st: string,
    id = 'wamid.A',
    ts = '1714780000',
    errors?: { code: number; title: string; message?: string }[],
    phoneNumberId = PHONE_ID_A,
  ): WapiWebhookPayload {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'biz-1',
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            statuses: [{
              id, recipient_id: '5491100', status: st as 'sent', timestamp: ts,
              ...(errors ? { errors } : {}),
            }],
          },
        }],
      }],
    };
  }

  function inboundPayload(
    msg: Record<string, unknown>,
    contactName = 'Ana',
    phoneNumberId = PHONE_ID_A,
  ): WapiWebhookPayload {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'biz-1',
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: phoneNumberId },
            contacts: [{ wa_id: '5491100', profile: { name: contactName } }],
            messages: [msg as never],
          },
        }],
      }],
    };
  }

  it('status delivered → DELIVERED + deliveredAt', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('delivered', 'wamid.A', '1714780000'), mapA);
    expect(prismaScoped.wapiReport.update).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: expect.objectContaining({ status: 'DELIVERED', deliveredAt: expect.any(Date) }),
    });
    expect(events.emitToTeamDebounced).toHaveBeenCalledWith(
      'team-a', 'wapi.report.updated', 'camp-1', { campaignId: 'camp-1' },
    );
  });

  it('status read → READ + readAt + deliveredAt si no estaba', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('read'), mapA);
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('READ');
    expect(args.data.readAt).toBeInstanceOf(Date);
    expect(args.data.deliveredAt).toBeInstanceOf(Date);
  });

  it('status read cuando ya está DELIVERED → no setea deliveredAt', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'DELIVERED',
    });
    await svc.process(statusPayload('read'), mapA);
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('READ');
    expect(args.data.deliveredAt).toBeUndefined();
  });

  it('status delivered cuando ya está READ → no retrocede (no update)', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'READ',
    });
    await svc.process(statusPayload('delivered'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('status failed → FAILED + error desde errors[0]', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(
      statusPayload('failed', 'wamid.A', '1714780000', [
        { code: 131026, title: 'Receiver is incapable', message: 'WA no instalado' },
      ]),
      mapA,
    );
    const args = prismaScoped.wapiReport.update.mock.calls[0]![0];
    expect(args.data.status).toBe('FAILED');
    expect(args.data.error).toMatch(/131026/);
    expect(args.data.error).toMatch(/Receiver is incapable/);
  });

  it('status sent → no-op (ya SENT desde el ack)', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce({
      id: 'rep-1', campaignId: 'camp-1', status: 'SENT',
    });
    await svc.process(statusPayload('sent'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('status sin report → skip sin tirar', async () => {
    prismaScoped.wapiReport.findFirst.mockResolvedValueOnce(null);
    await svc.process(statusPayload('delivered'), mapA);
    expect(prismaScoped.wapiReport.update).not.toHaveBeenCalled();
  });

  it('mensaje inbound texto → upsert conversation + crea message + evento', async () => {
    await svc.process(
      inboundPayload({
        id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
        text: { body: 'hola' },
      }),
      mapA,
    );
    expect(prismaScoped.wapiConversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId_configId_phone: { teamId: 'team-a', configId: 'cfg-1', phone: '5491100' } },
        create: expect.objectContaining({ phone: '5491100', name: 'Ana', unreadCount: 1 }),
      }),
    );
    expect(prismaScoped.wapiMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          metaMessageId: 'wamid.IN',
          fromMe: false,
          type: 'text',
          content: { text: { body: 'hola' } },
          status: 'received',
        }),
      }),
    );
    expect(events.emitToTeam).toHaveBeenCalledWith(
      'team-a', 'wapi.message.inbound',
      expect.objectContaining({ conversationId: 'conv-1', phone: '5491100', type: 'text' }),
    );
  });

  it('mensaje duplicado (P2002) → swallow sin tirar', async () => {
    const err = Object.assign(new Error('unique'), { code: 'P2002' });
    prismaScoped.wapiMessage.create.mockRejectedValueOnce(err);
    await expect(
      svc.process(
        inboundPayload({
          id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
          text: { body: 'duplicado' },
        }),
        mapA,
      ),
    ).resolves.toBeUndefined();
  });

  it('mensaje image: descarga media + persiste content + campos media', async () => {
    media.fetchInboundMedia.mockResolvedValue({
      sha256: 'sha-image-1',
      size: 1234,
      mime: 'image/jpeg',
      localPath: 'org-a/team-a/sha-image-1.jpg',
    });
    await svc.process(
      inboundPayload({
        id: 'wamid.IM', from: '5491100', timestamp: '1714780000', type: 'image',
        image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'foto' },
      }),
      mapA,
    );
    expect(media.fetchInboundMedia).toHaveBeenCalledWith('cfg-1', 'media-1');
    const data = prismaScoped.wapiMessage.create.mock.calls[0]![0].data;
    expect(data.content).toEqual({
      image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'foto' },
    });
    expect(data.type).toBe('image');
    expect(data.mediaId).toBe('media-1');
    expect(data.mediaSha256).toBe('sha-image-1');
    expect(data.mediaLocalPath).toBe('org-a/team-a/sha-image-1.jpg');
    expect(data.mediaCaption).toBe('foto');
  });

  it('mensaje image: si fetchInboundMedia falla, persiste sin localPath y no tira', async () => {
    media.fetchInboundMedia.mockRejectedValue(new Error('boom'));
    await svc.process(
      inboundPayload({
        id: 'wamid.IM2', from: '5491100', timestamp: '1714780000', type: 'image',
        image: { id: 'media-2', mime_type: 'image/jpeg' },
      }),
      mapA,
    );
    const data = prismaScoped.wapiMessage.create.mock.calls[0]![0].data;
    expect(data.mediaId).toBe('media-2');
    expect(data.mediaLocalPath).toBeNull();
  });

  it('multi-config: payload con dos phone_number_ids → cada entry usa su tenant', async () => {
    const cfgB: ResolvedWebhookConfig = {
      organizationId: 'org-a',
      teamId: 'team-b',
      configId: 'cfg-2',
    };
    const map = new Map<string, ResolvedWebhookConfig>([
      [PHONE_ID_A, cfgA],
      ['pn-B', cfgB],
    ]);
    const payload: WapiWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'biz-1',
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_ID_A },
              contacts: [{ wa_id: '5491111' }],
              messages: [{ id: 'wamid.A1', from: '5491111', timestamp: '1714780000', type: 'text', text: { body: 'A' } }],
            },
          }],
        },
        {
          id: 'biz-1',
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'pn-B' },
              contacts: [{ wa_id: '5492222' }],
              messages: [{ id: 'wamid.B1', from: '5492222', timestamp: '1714780000', type: 'text', text: { body: 'B' } }],
            },
          }],
        },
      ],
    };
    await svc.process(payload, map);
    expect(prismaScoped.wapiConversation.upsert).toHaveBeenCalledTimes(2);
    const calls = prismaScoped.wapiConversation.upsert.mock.calls;
    expect(calls[0]![0].where.teamId_configId_phone).toEqual({
      teamId: 'team-a', configId: 'cfg-1', phone: '5491111',
    });
    expect(calls[1]![0].where.teamId_configId_phone).toEqual({
      teamId: 'team-b', configId: 'cfg-2', phone: '5492222',
    });
  });

  it('phone_number_id sin entry en el map → skip esa entry', async () => {
    const payload = inboundPayload({
      id: 'wamid.IN', from: '5491100', timestamp: '1714780000', type: 'text',
      text: { body: 'hola' },
    }, 'Ana', 'pn-FANTASMA');
    await svc.process(payload, mapA);
    expect(prismaScoped.wapiConversation.upsert).not.toHaveBeenCalled();
  });
});
