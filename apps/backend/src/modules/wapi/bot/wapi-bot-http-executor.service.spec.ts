import http, { type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WapiBotHttpExecutor } from './wapi-bot-http-executor.service';
import { WapiBotHttpRateLimiterService } from './wapi-bot-http-rate-limiter.service';
import type { AuditLogService } from '../../../common/audit/audit-log.service';
import type { BotHttpNode } from './wapi-bot.types';

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

describe('WapiBotHttpExecutor', () => {
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
      const limiter = new WapiBotHttpRateLimiterService();
      const audit = makeAuditMock();
      const exec = new WapiBotHttpExecutor(limiter, audit);
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
      const limiter = new WapiBotHttpRateLimiterService();
      const audit = makeAuditMock();
      const exec = new WapiBotHttpExecutor(limiter, audit);
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
      const limiter = new WapiBotHttpRateLimiterService();
      const audit = makeAuditMock();
      const exec = new WapiBotHttpExecutor(limiter, audit);
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
      const limiter = new WapiBotHttpRateLimiterService();
      const audit = makeAuditMock();
      const exec = new WapiBotHttpExecutor(limiter, audit);
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
      await exec.execute(
        makeNode({ url: `${baseUrl}/u/{{userId}}` }),
        { userId: 'abc-123' },
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(lastRequest.url).toBe('/u/abc-123');
    });

    it('interpola body JSON-safe con comillas (no rompe el JSON)', async () => {
      nextResponse = { status: 200, body: '{}' };
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: `${baseUrl}/bin` }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(true);
      expect(r.body).toMatchObject({ binary: true, contentType: 'application/octet-stream' });
    });
  });

  describe('modo real — errores', () => {
    it('5xx → ok=false sin error sintético (es response real)', async () => {
      nextResponse = {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: '{"error":"down"}',
      };
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
      const r = await exec.execute(
        makeNode({ url: 'not-a-url' }),
        {},
        { mode: 'real', configId: 'c1', nodeId: 'n1', organizationId: 'org1' },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe('invalid-url');
    });

    it('scheme ftp:// → error invalid-scheme', async () => {
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
      const limiter = new WapiBotHttpRateLimiterService();
      const audit = makeAuditMock();
      // Vaciar tokens: capacity (60 default) — drenamos.
      for (let i = 0; i < 60; i++) limiter.tryAcquire('org1');
      const exec = new WapiBotHttpExecutor(limiter, audit);
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
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
    it('permite los primeros N requests y bloquea el N+1', () => {
      const lim = new WapiBotHttpRateLimiterService();
      const cap = lim.capacityForTests;
      for (let i = 0; i < cap; i++) {
        expect(lim.tryAcquire('org-x')).toBe(true);
      }
      expect(lim.tryAcquire('org-x')).toBe(false);
    });

    it('orgs distintas tienen buckets separados', () => {
      const lim = new WapiBotHttpRateLimiterService();
      for (let i = 0; i < lim.capacityForTests; i++) lim.tryAcquire('org-a');
      expect(lim.tryAcquire('org-a')).toBe(false);
      expect(lim.tryAcquire('org-b')).toBe(true);
    });
  });

  describe('connect.lookup compat con undici (regression)', () => {
    // undici llama lookup con `{ all: true }` y espera array [{address, family}].
    // Este test usa un hostname que se resuelva por DNS local a 127.0.0.1 (sin
    // atajo de IP literal en la URL → undici hace el lookup). Lo simulamos
    // usando `localhost` que en Linux suele resolverse a 127.0.0.1 vía /etc/hosts.
    it('apunta a un hostname que necesita lookup y conecta a localhost server', async () => {
      const limiter = new WapiBotHttpRateLimiterService();
      const exec = new WapiBotHttpExecutor(limiter, makeAuditMock());
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
