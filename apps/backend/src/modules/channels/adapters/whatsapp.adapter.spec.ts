/**
 * Fase 1a — Tests del WhatsAppAdapter: mapeo de OutboundMessage normalizado a la
 * llamada concreta del WapiSenderService, clamp de botones por capability, y
 * normalización del resultado a { externalMessageId }.
 */
import { WhatsAppAdapter, type WhatsAppConnection } from './whatsapp.adapter';

const conn: WhatsAppConnection = {
  phoneNumberId: 'pn-1',
  accessToken: 'tok',
  isTestMode: true,
};

function makeSender() {
  return {
    sendText: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.TEXT' }),
    sendInteractiveButtons: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.BTN' }),
    sendMediaById: jest.fn().mockResolvedValue({ metaMessageId: 'wamid.MEDIA' }),
  };
}

describe('WhatsAppAdapter', () => {
  it('kind y capabilities de WhatsApp', () => {
    const adapter = new WhatsAppAdapter(makeSender() as never);
    expect(adapter.kind).toBe('WHATSAPP');
    expect(adapter.capabilities.interactiveButtons).toEqual({ supported: true, max: 3 });
    expect(adapter.capabilities.freeformWindow).toEqual({ enforced: true, hours: 24 });
    expect(adapter.capabilities.templates).toBe(true);
  });

  it('text → sendText, devuelve externalMessageId', async () => {
    const sender = makeSender();
    const adapter = new WhatsAppAdapter(sender as never);
    const res = await adapter.send(conn, { kind: 'text', to: '549110', text: 'hola' });
    expect(sender.sendText).toHaveBeenCalledWith(
      { phoneNumberId: 'pn-1', accessToken: 'tok', isTestMode: true },
      { to: '549110', body: 'hola', previewUrl: false },
    );
    expect(res).toEqual({ externalMessageId: 'wamid.TEXT' });
  });

  it('buttons → sendInteractiveButtons', async () => {
    const sender = makeSender();
    const adapter = new WhatsAppAdapter(sender as never);
    const res = await adapter.send(conn, {
      kind: 'buttons',
      to: '549110',
      text: 'elegí',
      header: 'h',
      footer: 'f',
      buttons: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
    });
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: 'pn-1' }),
      expect.objectContaining({
        to: '549110',
        body: 'elegí',
        header: 'h',
        footer: 'f',
        buttons: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      }),
    );
    expect(res.externalMessageId).toBe('wamid.BTN');
  });

  it('buttons → clamp a máximo 3 (capability)', async () => {
    const sender = makeSender();
    const adapter = new WhatsAppAdapter(sender as never);
    await adapter.send(conn, {
      kind: 'buttons',
      to: '549110',
      text: 'elegí',
      buttons: [
        { id: '1', title: '1' },
        { id: '2', title: '2' },
        { id: '3', title: '3' },
        { id: '4', title: '4' },
        { id: '5', title: '5' },
      ],
    });
    const passed = sender.sendInteractiveButtons.mock.calls[0][1].buttons;
    expect(passed).toHaveLength(3);
    expect(passed.map((b: { id: string }) => b.id)).toEqual(['1', '2', '3']);
  });

  it('media → sendMediaById', async () => {
    const sender = makeSender();
    const adapter = new WhatsAppAdapter(sender as never);
    const res = await adapter.send(conn, {
      kind: 'media',
      to: '549110',
      mediaType: 'image',
      mediaId: 'media-1',
      caption: 'foto',
    });
    expect(sender.sendMediaById).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: 'pn-1' }),
      expect.objectContaining({ to: '549110', type: 'image', mediaId: 'media-1', caption: 'foto' }),
    );
    expect(res.externalMessageId).toBe('wamid.MEDIA');
  });

  it('media sin mediaId → error', async () => {
    const sender = makeSender();
    const adapter = new WhatsAppAdapter(sender as never);
    await expect(
      adapter.send(conn, { kind: 'media', to: '549110', mediaType: 'image' }),
    ).rejects.toThrow(/mediaId/);
  });

  // -- 1c: parseInbound (payload crudo Meta → InboundMessage[]) ----------------
  describe('parseInbound', () => {
    const adapter = new WhatsAppAdapter(makeSender() as never);

    function payload(value: Record<string, unknown>) {
      return {
        object: 'whatsapp_business_account',
        entry: [{ id: 'biz-1', changes: [{ field: 'messages', value }] }],
      };
    }

    it('payload no-whatsapp → []', () => {
      expect(adapter.parseInbound({ object: 'otra-cosa', entry: [] })).toEqual([]);
      expect(adapter.parseInbound(null)).toEqual([]);
      expect(adapter.parseInbound(undefined)).toEqual([]);
    });

    it('value sólo con statuses (sin messages) → []', () => {
      const out = adapter.parseInbound(
        payload({ metadata: { phone_number_id: 'pn-1' }, statuses: [{ id: 'wamid.X', status: 'delivered' }] }),
      );
      expect(out).toEqual([]);
    });

    it('mensaje de texto → InboundMessage normalizado + senderProfile del contacto', () => {
      const out = adapter.parseInbound(
        payload({
          metadata: { phone_number_id: 'pn-1' },
          contacts: [{ wa_id: '549110', profile: { name: 'Maxi' } }],
          messages: [{ id: 'wamid.1', from: '549110', timestamp: '1700000000', type: 'text', text: { body: 'hola' } }],
        }),
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        channelKind: 'WHATSAPP',
        externalUserId: '549110',
        externalMessageId: 'wamid.1',
        type: 'text',
        text: 'hola',
        senderProfile: { name: 'Maxi' },
      });
      expect(out[0]!.timestamp).toEqual(new Date(1700000000 * 1000));
    });

    it('interactive button_reply → type interactive_reply + interactiveReplyId', () => {
      const out = adapter.parseInbound(
        payload({
          metadata: { phone_number_id: 'pn-1' },
          messages: [
            {
              id: 'wamid.2',
              from: '549110',
              timestamp: '1700000001',
              type: 'interactive',
              interactive: { type: 'button_reply', button_reply: { id: 'bot:soporte', title: 'Soporte' } },
            },
          ],
        }),
      );
      expect(out[0]).toMatchObject({
        type: 'interactive_reply',
        interactiveReplyId: 'bot:soporte',
        text: 'Soporte',
      });
    });

    it('button de template (CTA legacy) → interactiveReplyId + referral source=template', () => {
      const out = adapter.parseInbound(
        payload({
          metadata: { phone_number_id: 'pn-1' },
          messages: [
            { id: 'wamid.3', from: '549110', timestamp: '1700000002', type: 'button', button: { payload: 'OFERTA_X', text: 'Ver oferta' } },
          ],
        }),
      );
      expect(out[0]).toMatchObject({
        type: 'interactive_reply',
        interactiveReplyId: 'OFERTA_X',
        referral: { payload: 'OFERTA_X', source: 'template' },
      });
    });

    it('imagen → type image + media (id/mime/caption)', () => {
      const out = adapter.parseInbound(
        payload({
          metadata: { phone_number_id: 'pn-1' },
          messages: [
            {
              id: 'wamid.4',
              from: '549110',
              timestamp: '1700000003',
              type: 'image',
              image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'abc', caption: 'foto' },
            },
          ],
        }),
      );
      expect(out[0]).toMatchObject({
        type: 'image',
        media: { id: 'media-1', mime: 'image/jpeg', sha256: 'abc', caption: 'foto' },
      });
    });

    it('varios entries/messages → se aplanan todos', () => {
      const out = adapter.parseInbound({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'biz-1',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: 'pn-1' },
                  messages: [
                    { id: 'wamid.a', from: '111', timestamp: '1700000000', type: 'text', text: { body: 'a' } },
                    { id: 'wamid.b', from: '222', timestamp: '1700000000', type: 'text', text: { body: 'b' } },
                  ],
                },
              },
            ],
          },
        ],
      });
      expect(out.map((m) => m.externalMessageId)).toEqual(['wamid.a', 'wamid.b']);
    });
  });
});
