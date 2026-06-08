import http, { type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { BotHttpExecutor } from './bot-http-executor.service';
import { BotHttpRateLimiterService } from './bot-http-rate-limiter.service';
import type { AuditLogService } from '../../common/audit/audit-log.service';
import type { BotHttpNode } from './bot.types';

/**
 * Tests del executor HTTP. Para evitar mockear undici al nivel de bajo nivel,
 * levantamos un http.createServer real en puerto random sobre localhost. Eso
 * requiere WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS=true para pasar el SSRF guard.
 */

function makeAuditMock(): jest.Mocked<AuditLogService> {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditLogService>;
}

/**
 * Rate limiter respaldado por Redis: cada instancia recibe un fake con un Map
 * propio que replica el token bucket del script Lua (tiempo = Date.now()). Da el
 * mismo comportamiento observable que el bucket, aislado por test.
 */
function makeLimiter(): BotHttpRateLimiterService {
  const store = new Map<string, { tokens: number; lastRefill: number }>();
  const fakeRedis = {
    client: {
      eval: async (_script: string, _numKeys: number, key: string, capStr: string) => {
        const capacity = Number(capStr);
        const now = Date.now();
        const b = store.get(key) ?? { tokens: capacity, lastRefill: now };
        const elapsed = now - b.lastRefill;
        if (elapsed > 0) {
          b.tokens = Math.min(capacity, b.tokens + (elapsed / 60000) * capacity);
          b.lastRefill = now;
        }
        let allowed = 0;
        if (b.tokens >= 1) {
          b.tokens -= 1;
          allowed = 1;
        }
        store.set(key, b);
        return allowed;
      },
    },
  };
  return new BotHttpRateLimiterService(fakeRedis as never);
}

function makeNode(overrides: Partial<BotHttpNode> = {}): BotHttpNode {
  return {
    kind: 'HTTP',
    method: 'GET',
    url: 'http://localhost/test',
    saveAs: 'r',
    timeoutMs: 2000,
    ...overrides,
  };
}

const ORIG_ENV = { ...process.env };

describe('BotHttpExecutor', () => {
  let server: Server | null = null;
  let baseUrl = '';
  let lastRequest: { url?: string; method?: string; headers: Record<string, string>; body: string } = {
    headers: {},
    body: '',
  };
  let nextResponse: { status: number; headers?: Record<string, string>; body?: string } = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastRequest = {
          url: req.url,
          method: req.method,
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
          ),
          body: Buffer.concat(chunks).toString('utf8'),
        };
        res.writeHead(nextResponse.status, nextResponse.headers ?? {});
        if (nextResponse.body !== undefined) res.write(nextResponse.body);
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS = 'true';
      done();
    });
  });

  afterAll((done) => {
    process.env = { ...ORIG_ENV };
    if (server) server.close(() => done());
    else done();
  });

  beforeEach(() => {
    lastRequest = { headers: {}, body: '' };
    nextResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  });

  describe('modo mock', () => {
    it('devuelve mockResponse cuando está definido', async () => {
      const limiter = makeLimiter();
      const audit = makeAuditMock();
      const exec = new BotHttpExecutor(limiter, audit);
      const r = await exec.execute(
        makeNode({ mockResponse: { status: 200, body: { nombre: 'Mock' } } }),
        {},
        { mode: 'mock', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ nombre: 'Mock' });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('mockResponse con status 5xx → ok=false', async () => {
      const limiter = makeLimiter();
      const audit = makeAuditMock();
      const exec = new BotHttpExecutor(limiter, audit);
      const r = await exec.execute(
        makeNode({ mockResponse: { status: 503, body: { error: 'down' } } }),
        {},
        { mode: 'mock', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.status).toBe(503);
      expect(r.error).toBeUndefined(); // status 5xx no es "error sintético", es response real-shape
    });

    it('sin mockResponse → error mock-undefined', async () => {
      const limiter = makeLimiter();
      const audit = makeAuditMock();
      const exec = new BotHttpExecutor(limiter, audit);
      const r = await exec.execute(makeNode(), {}, {
        mode: 'mock',
        configId: 'c1',
        nodeId: 'n1',
        organizationId: 'org1',
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('mock-undefined');
    });
  });

  describe('modo real — happy path', () => {
    it('GET 200 con response JSON parseada', async () => {
      nextResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: 'Juan', pedidos: 3 }),
      };
      const limiter = makeLimiter();
      const audit = makeAuditMock();
      const exec = new BotHttpExecutor(limiter, audit);
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/clientes/123` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ nombre: 'Juan', pedidos: 3 });
      expect(lastRequest.method).toBe('GET');
      expect(lastRequest.url).toBe('/clientes/123');
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'wapi.bot.http.executed',
          metadata: expect.objectContaining({
            urlHost: expect.stringContaining('127.0.0.1'),
            status: 200,
            ok: true,
            method: 'GET',
            mode: 'real',
          }),
        }),
      );
    });

    it('POST con body JSON y Content-Type auto', async () => {
      nextResponse = { status: 201, headers: { 'content-type': 'application/json' }, body: '{"id":42}' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({
          method: 'POST',
          url: `${baseUrl}/items`,
          body: { nombre: 'Pedido', total: 100 },
        }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      expect(r.status).toBe(201);
      expect(lastRequest.method).toBe('POST');
      expect(lastRequest.headers['content-type']).toBe('application/json');
      expect(JSON.parse(lastRequest.body)).toEqual({ nombre: 'Pedido', total: 100 });
    });

    it('interpola url con {{var}}', async () => {
      nextResponse = { status: 200, body: '{}' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      await exec.execute(
        makeNode({ url: `${baseUrl}/u/{{userId}}` }),
        { userId: 'abc-123' },
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(lastRequest.url).toBe('/u/abc-123');
    });

    it('interpola body JSON-safe con comillas (no rompe el JSON)', async () => {
      nextResponse = { status: 200, body: '{}' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      await exec.execute(
        makeNode({
          method: 'POST',
          url: `${baseUrl}/x`,
          body: { nombre: '{{nombre}}', otros: ['a', '{{val}}', 'b'] },
        }),
        { nombre: 'O"Brien — "el grande"', val: 'cualquier "cosa"' },
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      const parsed = JSON.parse(lastRequest.body);
      expect(parsed.nombre).toBe('O"Brien — "el grande"');
      expect(parsed.otros).toEqual(['a', 'cualquier "cosa"', 'b']);
    });

    it('interpola headers con {{var}}', async () => {
      nextResponse = { status: 200, body: '{}' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      await exec.execute(
        makeNode({
          url: `${baseUrl}/x`,
          headers: { Authorization: 'Bearer {{token}}' },
        }),
        { token: 'tok-secret' },
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(lastRequest.headers['authorization']).toBe('Bearer tok-secret');
    });

    it('content-type text/plain devuelve string', async () => {
      nextResponse = { status: 200, headers: { 'content-type': 'text/plain' }, body: 'hola mundo' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/text` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.body).toBe('hola mundo');
    });

    it('content-type binario devuelve placeholder', async () => {
      nextResponse = {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body: '\x00\x01\x02\x03',
      };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/bin` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      expect(r.body).toMatchObject({ binary: true, contentType: 'application/octet-stream' });
    });

    it('XML: numeric entities (&#xF3;) se decodifican a caracteres reales (acentos)', async () => {
      // Typical en webservices gov.ar de Java/Axis viejos: mandan los acentos
      // como numeric character references en lugar de UTF-8. Sin htmlEntities,
      // los caracteres llegan como `&#xF3;` literales al bot.
      nextResponse = {
        status: 200,
        headers: { 'content-type': 'text/xml; charset=utf-8' },
        body:
          '<?xml version="1.0"?><root>' +
          '<descripcion>Notificaci&#xF3;n de Infracci&#xF3;n</descripcion>' +
          '<motivo>L&#xED;mites de velocidad</motivo>' +
          '</root>',
      };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/xml-entities` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      const body = r.body as { root: { descripcion: string; motivo: string } };
      expect(body.root.descripcion).toBe('Notificación de Infracción');
      expect(body.root.motivo).toBe('Límites de velocidad');
    });

    it('SOAP: body string crudo se envía sin JSON.stringify y XML response se parsea a JSON', async () => {
      // El server recibe el SOAP request y devuelve un SOAP response. Verificamos
      // que el body llegó intacto (no envuelto en quotes por stringify) y que el
      // executor parsea el XML response, removiendo prefijos de namespace para
      // que el bot pueda acceder con dot-notation.
      const soapResponse = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getActasResponse xmlns="http://example/ws/">
      <resultado>
        <total>2</total>
        <actas>
          <item><nro>123</nro><importe>500</importe></item>
          <item><nro>456</nro><importe>750</importe></item>
        </actas>
      </resultado>
    </getActasResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
      nextResponse = {
        status: 200,
        headers: { 'content-type': 'text/xml; charset=utf-8' },
        body: soapResponse,
      };

      const soapRequestBody = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><getActas><dni>33689563</dni></getActas></soapenv:Body></soapenv:Envelope>`;

      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({
          url: `${baseUrl}/soap`,
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
          body: soapRequestBody,
        }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );

      // Body llegó al server crudo (sin JSON.stringify wrap).
      expect(lastRequest.body).toBe(soapRequestBody);
      expect(lastRequest.headers['content-type']).toContain('text/xml');
      expect(lastRequest.headers['soapaction']).toBe('""');

      // Response XML se parseó a JSON. Con removeNSPrefix, `soapenv:Envelope` →
      // `Envelope`, lo que permite acceder via dot-notation desde el bot.
      expect(r.ok).toBe(true);
      const body = r.body as Record<string, any>;
      expect(body).toHaveProperty('Envelope.Body.getActasResponse.resultado.total', 2);
      const actas = body.Envelope.Body.getActasResponse.resultado.actas.item;
      expect(Array.isArray(actas)).toBe(true);
      expect(actas).toHaveLength(2);
      expect(actas[0]).toMatchObject({ nro: 123, importe: 500 });
      expect(actas[1]).toMatchObject({ nro: 456, importe: 750 });
    });

    it('body string sin Content-Type explícito no auto-defaultea a application/json', async () => {
      // Cuando el bot manda un body string crudo (xml/x-www-form-urlencoded/etc)
      // y no setea Content-Type, NO lo asumimos como JSON. El cliente debe
      // setearlo explícito; mientras tanto fetch manda sin Content-Type.
      nextResponse = { status: 200, headers: { 'content-type': 'text/plain' }, body: 'ok' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      await exec.execute(
        makeNode({
          url: `${baseUrl}/raw`,
          method: 'POST',
          body: 'foo=bar&baz=qux',
        }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(lastRequest.body).toBe('foo=bar&baz=qux');
      // Sin auto-default a application/json
      expect(lastRequest.headers['content-type']).not.toContain('application/json');
    });
  });

  describe('HTTP-en-prod allowlist (WAPI_BOT_HTTP_INSECURE_HOSTS)', () => {
    it('NODE_ENV=production + host NO está en allowlist → http-not-allowed-in-prod', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.WAPI_BOT_HTTP_INSECURE_HOSTS;
      process.env.NODE_ENV = 'production';
      process.env.WAPI_BOT_HTTP_INSECURE_HOSTS = 'allowed.example.com';
      try {
        const limiter = makeLimiter();
        const exec = new BotHttpExecutor(limiter, makeAuditMock());
        const r = await exec.execute(
          makeNode({ url: `${baseUrl}/blocked` }),
          {},
          { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
        );
        expect(r.ok).toBe(false);
        expect(r.error).toBe('http-not-allowed-in-prod');
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow === undefined) delete process.env.WAPI_BOT_HTTP_INSECURE_HOSTS;
        else process.env.WAPI_BOT_HTTP_INSECURE_HOSTS = originalAllow;
      }
    });

    it('NODE_ENV=production + host SÍ está en allowlist → request pasa', async () => {
      nextResponse = { status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' };
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.WAPI_BOT_HTTP_INSECURE_HOSTS;
      process.env.NODE_ENV = 'production';
      process.env.WAPI_BOT_HTTP_INSECURE_HOSTS = '127.0.0.1, another.example.com';
      try {
        const limiter = makeLimiter();
        const exec = new BotHttpExecutor(limiter, makeAuditMock());
        const r = await exec.execute(
          makeNode({ url: `${baseUrl}/allowed` }),
          {},
          { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
        );
        expect(r.ok).toBe(true);
        expect(r.body).toEqual({ ok: true });
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllow === undefined) delete process.env.WAPI_BOT_HTTP_INSECURE_HOSTS;
        else process.env.WAPI_BOT_HTTP_INSECURE_HOSTS = originalAllow;
      }
    });
  });

  describe('modo real — errores', () => {
    it('5xx → ok=false sin error sintético (es response real)', async () => {
      nextResponse = {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: '{"error":"down"}',
      };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/fail` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.status).toBe(500);
      expect(r.error).toBeUndefined();
      expect(r.body).toEqual({ error: 'down' });
    });

    it('redirect 302 → error redirect-not-followed', async () => {
      nextResponse = { status: 302, headers: { location: '/elsewhere' }, body: '' };
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/redir` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.status).toBe(302);
      expect(r.error).toBe('redirect-not-followed');
    });

    it('URL inválida → error invalid-url', async () => {
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: 'not-a-url' }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('invalid-url');
    });

    it('scheme ftp:// → error invalid-scheme', async () => {
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: 'ftp://example.com/x' }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('invalid-scheme');
    });

    it('SSRF bloquea cuando allowPrivate=false', async () => {
      process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS = 'false';
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: 'http://169.254.169.254/latest/meta-data/' }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('ssrf-blocked');
      process.env.WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS = 'true';
    });

    it('rate limited cuando se acaban los tokens', async () => {
      const limiter = makeLimiter();
      const audit = makeAuditMock();
      // Vaciar tokens: capacity (60 default) — drenamos.
      for (let i = 0; i < 60; i++) await limiter.tryAcquire('org1');
      const exec = new BotHttpExecutor(limiter, audit);
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/x` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('rate-limited');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('feature disabled vía env → error feature-disabled', async () => {
      process.env.WAPI_BOT_HTTP_ENABLED = 'false';
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/x` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('feature-disabled');
      delete process.env.WAPI_BOT_HTTP_ENABLED;
    });
  });

  describe('rate limiter (token bucket)', () => {
    it('permite los primeros N requests y bloquea el N+1', async () => {
      const lim = makeLimiter();
      const cap = lim.capacityForTests;
      for (let i = 0; i < cap; i++) {
        expect(await lim.tryAcquire('org-x')).toBe(true);
      }
      expect(await lim.tryAcquire('org-x')).toBe(false);
    });

    it('orgs distintas tienen buckets separados', async () => {
      const lim = makeLimiter();
      for (let i = 0; i < lim.capacityForTests; i++) await lim.tryAcquire('org-a');
      expect(await lim.tryAcquire('org-a')).toBe(false);
      expect(await lim.tryAcquire('org-b')).toBe(true);
    });
  });

  describe('connect.lookup compat con undici (regression)', () => {
    // undici llama lookup con `{ all: true }` y espera array [{address, family}].
    // Este test usa un hostname que se resuelva por DNS local a 127.0.0.1 (sin
    // atajo de IP literal en la URL → undici hace el lookup). Lo simulamos
    // usando `localhost` que en Linux suele resolverse a 127.0.0.1 vía /etc/hosts.
    it('apunta a un hostname que necesita lookup y conecta a localhost server', async () => {
      const limiter = makeLimiter();
      const exec = new BotHttpExecutor(limiter, makeAuditMock());
      // Sustituimos 127.0.0.1 por 'localhost' para forzar a undici a llamar lookup.
      const localUrl = baseUrl.replace('127.0.0.1', 'localhost');
      nextResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"hello":"world"}',
      };
      const r = await exec.execute(
        makeNode({ url: `${localUrl}/test` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      // Si el lookup callback estuviera mal (e.g. devolviera firma legacy con all=true),
      // undici tira ERR_INVALID_IP_ADDRESS → network-error.
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ hello: 'world' });
    });
  });
});
