/**
 * Tests del WapiWebhookController (1c) — ahora es un alias delgado que delega en
 * `WhatsAppWebhookHandler`. La lógica de resolución/HMAC se testea en
 * `whatsapp-webhook.handler.spec.ts`; acá sólo verificamos que reenvía los args.
 */
import { WapiWebhookController } from './wapi-webhook.controller';

describe('WapiWebhookController (alias → WhatsAppWebhookHandler)', () => {
  let handler: { verify: jest.Mock; receive: jest.Mock };
  let ctl: WapiWebhookController;

  beforeEach(() => {
    handler = {
      verify: jest.fn().mockResolvedValue('CHAL'),
      receive: jest.fn().mockResolvedValue({ ok: true }),
    };
    ctl = new WapiWebhookController(handler as never);
  });

  it('verify → delega en handler.verify con los mismos args', async () => {
    const out = await ctl.verify('wbh_x', 'subscribe', 'tok', 'CHAL');
    expect(out).toBe('CHAL');
    expect(handler.verify).toHaveBeenCalledWith('wbh_x', 'subscribe', 'tok', 'CHAL');
  });

  it('receive → delega en handler.receive con slug, firma y rawBody', async () => {
    const raw = Buffer.from('{}');
    const out = await ctl.receive('wbh_x', 'sha256=abc', { rawBody: raw } as never);
    expect(out).toEqual({ ok: true });
    expect(handler.receive).toHaveBeenCalledWith('wbh_x', 'sha256=abc', raw);
  });
});
