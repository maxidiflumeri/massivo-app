/**
 * Tests del WapiSenderService. Mockea fetch global; no abre red.
 *  - sendText / sendTemplate happy path → returns metaMessageId
 *  - error 4xx con error.code 131056 → WapiSendException con isRateLimit=true
 *  - error 4xx con error.code 190 (auth) → isAuth=true, retryable=false
 *  - 200 OK sin messages[] → tira para no marcar SENT sin id real
 *  - 5xx genérico → retryable=true, isRateLimit=false
 */
import { ConfigService } from '@nestjs/config';
import { WapiSenderService } from './wapi-sender.service';
import { WapiSendException } from './wapi-sender.types';

const noopEventLogger = new Proxy({}, { get: () => () => undefined }) as never;

describe('WapiSenderService', () => {
  let svc: WapiSenderService;
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    svc = new WapiSenderService(new ConfigService({}), noopEventLogger);
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mkResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('sendText OK → metaMessageId', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(200, { messages: [{ id: 'wamid.X' }] }));
    const out = await svc.sendText(
      { phoneNumberId: 'ph1', accessToken: 'tok' },
      { to: '5491100', body: 'hola' },
    );
    expect(out.metaMessageId).toBe('wamid.X');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/graph\.facebook\.com\/v20\.0\/ph1\/messages$/);
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer tok');
    const sent = JSON.parse(init.body);
    expect(sent.type).toBe('text');
    expect(sent.text.body).toBe('hola');
  });

  it('sendTemplate OK con components', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(200, { messages: [{ id: 'wamid.Y' }] }));
    const out = await svc.sendTemplate(
      { phoneNumberId: 'ph1', accessToken: 'tok' },
      {
        to: '5491100',
        templateName: 'welcome',
        language: 'es',
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
      },
    );
    expect(out.metaMessageId).toBe('wamid.Y');
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sent.type).toBe('template');
    expect(sent.template.name).toBe('welcome');
    expect(sent.template.language.code).toBe('es');
    expect(sent.template.components[0].parameters[0].text).toBe('Ana');
  });

  it('error code 131056 (pair rate limit) → isRateLimit=true, retryable=true', async () => {
    fetchMock.mockResolvedValueOnce(
      mkResponse(400, {
        error: { code: 131056, message: 'Pair rate limit hit', type: 'OAuthException' },
      }),
    );
    try {
      await svc.sendText({ phoneNumberId: 'ph1', accessToken: 'tok' }, { to: 'x', body: 'y' });
      throw new Error('no tiro');
    } catch (err) {
      expect(err).toBeInstanceOf(WapiSendException);
      const e = err as WapiSendException;
      expect(e.detail.code).toBe(131056);
      expect(e.detail.isRateLimit).toBe(true);
      expect(e.detail.retryable).toBe(true);
      expect(e.detail.isAuth).toBe(false);
    }
  });

  it('error code 190 (auth) → isAuth=true, retryable=false', async () => {
    fetchMock.mockResolvedValueOnce(
      mkResponse(401, {
        error: { code: 190, message: 'Invalid OAuth token' },
      }),
    );
    await expect(
      svc.sendText({ phoneNumberId: 'ph1', accessToken: 'tok' }, { to: 'x', body: 'y' }),
    ).rejects.toMatchObject({
      detail: expect.objectContaining({ code: 190, isAuth: true, retryable: false }),
    });
  });

  it('200 OK sin messages[0].id → tira (no marcar SENT sin id real)', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(200, {}));
    await expect(
      svc.sendText({ phoneNumberId: 'ph1', accessToken: 'tok' }, { to: 'x', body: 'y' }),
    ).rejects.toThrow(/sin messages\[0\]\.id/);
  });

  it('5xx genérico → retryable=true, isRateLimit=false', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(503, { error: { code: 1 } }));
    await expect(
      svc.sendText({ phoneNumberId: 'ph1', accessToken: 'tok' }, { to: 'x', body: 'y' }),
    ).rejects.toMatchObject({
      detail: expect.objectContaining({ retryable: true, isRateLimit: false }),
    });
  });

  it('429 sin error.code → isRateLimit=true (HTTP-level)', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(429, {}));
    await expect(
      svc.sendText({ phoneNumberId: 'ph1', accessToken: 'tok' }, { to: 'x', body: 'y' }),
    ).rejects.toMatchObject({
      detail: expect.objectContaining({ isRateLimit: true, retryable: true }),
    });
  });

  it('respeta WAPI_GRAPH_BASE_URL para staging/mocks', async () => {
    const stagingSvc = new WapiSenderService(
      new ConfigService({ WAPI_GRAPH_BASE_URL: 'http://localhost:9999' }),
      noopEventLogger,
    );
    fetchMock.mockResolvedValueOnce(mkResponse(200, { messages: [{ id: 'm1' }] }));
    await stagingSvc.sendText(
      { phoneNumberId: 'ph1', accessToken: 'tok' },
      { to: 'x', body: 'y' },
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:9999/v20.0/ph1/messages');
  });
});
