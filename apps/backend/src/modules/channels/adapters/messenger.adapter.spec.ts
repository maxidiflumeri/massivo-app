import { MessengerAdapter } from './messenger.adapter';
import { WapiSendException } from '../../wapi/sender/wapi-sender.types';

describe('MessengerAdapter', () => {
  let adapter: MessengerAdapter;

  beforeEach(() => {
    adapter = new MessengerAdapter();
  });

  it('kind=MESSENGER y capabilities de Messenger (quick replies 13, ventana 24h, sin templates)', () => {
    expect(adapter.kind).toBe('MESSENGER');
    expect(adapter.capabilities.interactiveButtons).toEqual({ supported: true, max: 13 });
    expect(adapter.capabilities.freeformWindow).toEqual({ enforced: true, hours: 24 });
    expect(adapter.capabilities.templates).toBe(false);
  });

  describe('send', () => {
    const conn = { pageId: 'PAGE1', accessToken: 'tok', isTestMode: false };

    afterEach(() => {
      // @ts-expect-error limpiar el mock de fetch
      delete global.fetch;
    });

    it('test mode → short-circuit con id SIM_ sin pegar a Graph', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as never;
      const res = await adapter.send(
        { pageId: 'PAGE1', accessToken: 'tok', isTestMode: true },
        { kind: 'text', to: 'PSID1', text: 'hola' },
      );
      expect(res.externalMessageId).toMatch(/^mid\.SIM_/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('text → POST /me/messages con recipient + message.text; devuelve message_id', async () => {
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message_id: 'mid.ABC', recipient_id: 'PSID1' }),
      });
      global.fetch = fetchSpy as never;

      const res = await adapter.send(conn, { kind: 'text', to: 'PSID1', text: 'hola' });

      expect(res.externalMessageId).toBe('mid.ABC');
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/me/messages');
      const body = JSON.parse((init as { body: string }).body);
      expect(body.recipient).toEqual({ id: 'PSID1' });
      expect(body.message).toEqual({ text: 'hola' });
    });

    it('buttons → quick_replies, clamp a 13', async () => {
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message_id: 'mid.QR' }),
      });
      global.fetch = fetchSpy as never;

      const buttons = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, title: `Opción ${i}` }));
      await adapter.send(conn, { kind: 'buttons', to: 'PSID1', text: 'Elegí', buttons });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.message.text).toBe('Elegí');
      expect(body.message.quick_replies).toHaveLength(13);
      expect(body.message.quick_replies[0]).toEqual({
        content_type: 'text',
        title: 'Opción 0',
        payload: 'b0',
      });
    });

    it('Graph 4xx → WapiSendException', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 190, message: 'Invalid OAuth' } }),
      }) as never;

      await expect(
        adapter.send(conn, { kind: 'text', to: 'PSID1', text: 'x' }),
      ).rejects.toBeInstanceOf(WapiSendException);
    });

    it('media sin url → error (Messenger no usa media_id de WhatsApp)', async () => {
      global.fetch = jest.fn() as never;
      await expect(
        adapter.send(conn, { kind: 'media', to: 'PSID1', mediaType: 'image', mediaId: 'wa-id' }),
      ).rejects.toThrow(/url/i);
    });
  });

  describe('parseInbound', () => {
    function envelope(messaging: unknown[]) {
      return { object: 'page', entry: [{ id: 'PAGE1', messaging }] };
    }

    it('payload de otro object → []', () => {
      expect(adapter.parseInbound({ object: 'instagram', entry: [] })).toEqual([]);
      expect(adapter.parseInbound(null)).toEqual([]);
    });

    it('texto → InboundMessage type=text con PSID y mid', () => {
      const out = adapter.parseInbound(
        envelope([
          { sender: { id: 'PSID1' }, timestamp: 1714780000000, message: { mid: 'm.1', text: 'hola' } },
        ]),
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        channelKind: 'MESSENGER',
        externalUserId: 'PSID1',
        externalMessageId: 'm.1',
        type: 'text',
        text: 'hola',
      });
      expect(out[0]!.timestamp).toEqual(new Date(1714780000000));
    });

    it('quick reply → interactive_reply con interactiveReplyId=payload', () => {
      const out = adapter.parseInbound(
        envelope([
          {
            sender: { id: 'PSID1' },
            timestamp: 1,
            message: { mid: 'm.2', text: 'Sí', quick_reply: { payload: 'OPT_YES' } },
          },
        ]),
      );
      expect(out[0]).toMatchObject({
        type: 'interactive_reply',
        interactiveReplyId: 'OPT_YES',
        text: 'Sí',
      });
    });

    it('postback → interactive_reply (payload + title)', () => {
      const out = adapter.parseInbound(
        envelope([
          { sender: { id: 'PSID1' }, timestamp: 1, postback: { payload: 'GET_STARTED', title: 'Empezar' } },
        ]),
      );
      expect(out[0]).toMatchObject({
        type: 'interactive_reply',
        interactiveReplyId: 'GET_STARTED',
        text: 'Empezar',
      });
      expect(out[0]!.externalMessageId).toContain('pb_');
    });

    it('echo se ignora', () => {
      const out = adapter.parseInbound(
        envelope([
          { sender: { id: 'PAGE1' }, timestamp: 1, message: { mid: 'm.echo', text: 'x', is_echo: true } },
        ]),
      );
      expect(out).toEqual([]);
    });

    it('attachment imagen → type=image + media.url', () => {
      const out = adapter.parseInbound(
        envelope([
          {
            sender: { id: 'PSID1' },
            timestamp: 1,
            message: { mid: 'm.3', attachments: [{ type: 'image', payload: { url: 'https://x/img.jpg' } }] },
          },
        ]),
      );
      expect(out[0]).toMatchObject({ type: 'image', media: { url: 'https://x/img.jpg' } });
    });
  });
});
