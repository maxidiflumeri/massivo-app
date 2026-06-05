/**
 * Tests del ChannelsWebhookController (1c — webhook genérico /api/channels/:kind/:slug).
 * Verifica el dispatch por kind: whatsapp → handler; kind desconocido → 404;
 * kind registrado pero sin handler de inbound → 501.
 */
import { NotFoundException, NotImplementedException } from '@nestjs/common';
import { ChannelsWebhookController } from './channels-webhook.controller';

describe('ChannelsWebhookController', () => {
  let registry: { has: jest.Mock };
  let whatsapp: { verify: jest.Mock; receive: jest.Mock };
  let ctl: ChannelsWebhookController;

  beforeEach(() => {
    registry = { has: jest.fn((k: string) => k === 'WHATSAPP') };
    whatsapp = {
      verify: jest.fn().mockResolvedValue('CHAL'),
      receive: jest.fn().mockResolvedValue({ ok: true }),
    };
    ctl = new ChannelsWebhookController(registry as never, whatsapp as never);
  });

  it('verify whatsapp → delega en el handler de WhatsApp', async () => {
    const out = await ctl.verify('whatsapp', 'wbh_x', 'subscribe', 'tok', 'CHAL');
    expect(out).toBe('CHAL');
    expect(whatsapp.verify).toHaveBeenCalledWith('wbh_x', 'subscribe', 'tok', 'CHAL');
  });

  it('kind case-insensitive (WhatsApp/WHATSAPP) → resuelve igual', async () => {
    await ctl.verify('WhatsApp', 'wbh_x', 'subscribe', 'tok', 'CHAL');
    expect(whatsapp.verify).toHaveBeenCalled();
  });

  it('receive whatsapp → delega con slug, firma y rawBody', async () => {
    const raw = Buffer.from('{}');
    const out = await ctl.receive('whatsapp', 'wbh_x', 'sha256=abc', { rawBody: raw } as never);
    expect(out).toEqual({ ok: true });
    expect(whatsapp.receive).toHaveBeenCalledWith('wbh_x', 'sha256=abc', raw);
  });

  it('kind no registrado → 404', async () => {
    await expect(
      ctl.verify('telegram', 'wbh_x', 'subscribe', 'tok', 'CHAL'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(whatsapp.verify).not.toHaveBeenCalled();
  });

  it('kind registrado pero sin handler de inbound (ej. messenger) → 501', async () => {
    registry.has.mockImplementation((k: string) => k === 'MESSENGER');
    await expect(
      ctl.receive('messenger', 'wbh_x', undefined, { rawBody: Buffer.from('{}') } as never),
    ).rejects.toBeInstanceOf(NotImplementedException);
  });
});
