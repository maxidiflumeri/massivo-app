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
});
