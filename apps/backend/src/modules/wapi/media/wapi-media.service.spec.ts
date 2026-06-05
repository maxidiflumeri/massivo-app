/**
 * Tests del WapiMediaService.
 *  - validateUpload: tira INVALID_MIME y TOO_LARGE acordes
 *  - uploadToMeta: happy path → mediaId + sha256 + persistencia local
 *  - uploadToMeta: error de Meta → WapiMediaException META_UPLOAD_FAILED
 *  - fetchInboundMedia: dos llamadas (info + binario) → WapiMediaDownloadResult
 *  - persistencia idempotente: mismo sha256 no re-escribe
 */
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiMediaService } from './wapi-media.service';
import { WapiMediaException } from './wapi-media.types';

describe('WapiMediaService', () => {
  let svc: WapiMediaService;
  let tmpDir: string;
  let prismaMock: Record<string, any>;
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;

  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org1',
    teamId: 'team1',
    orgRole: 'MEMBER',
    teamRole: 'MEMBER',
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wapi-media-test-'));
    prismaMock = {
      channel: {
        findFirst: jest.fn().mockResolvedValue({
          phoneNumberId: 'ph1',
          accessTokenEnc: 'tok-enc',
          organizationId: 'org1',
          teamId: 'team1',
          isActive: true,
        }),
      },
    };
    const cfg = new ConfigService({
      WAPI_MEDIA_DIR: tmpDir,
      WAPI_GRAPH_BASE_URL: 'https://graph.test',
      META_GRAPH_API_VERSION: 'v20.0',
    });
    svc = new WapiMediaService(
      { scoped: prismaMock } as never,
      cfg,
      { decrypt: (v: string) => `dec:${v}` } as never,
    );
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mkResponse(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
  }

  function mkBinResponse(status: number, buffer: Buffer): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    } as unknown as Response;
  }

  it('validateUpload tira INVALID_MIME para mime no permitido', () => {
    expect(() => svc.validateUpload('image', 'image/gif', 100)).toThrow(WapiMediaException);
  });

  it('validateUpload tira TOO_LARGE para tamaño excesivo', () => {
    expect(() => svc.validateUpload('image', 'image/jpeg', 6 * 1024 * 1024)).toThrow(
      /excede el límite/,
    );
  });

  it('uploadToMeta happy path → persiste local y devuelve mediaId+sha256', async () => {
    fetchMock.mockResolvedValueOnce(mkResponse(200, { id: 'meta-id-123' }));
    const buffer = Buffer.from('hello world');
    const out = await TenantContext.run(ctx, () =>
      svc.uploadToMeta({
        configId: 'cfg1',
        type: 'image',
        buffer,
        mime: 'image/jpeg',
        filename: 'foo.jpg',
      }),
    );
    expect(out.mediaId).toBe('meta-id-123');
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.size).toBe(buffer.length);
    expect(out.localPath).toMatch(/^org1\/team1\/[0-9a-f]{64}\.jpg$/);

    const persisted = await fs.readFile(path.join(tmpDir, out.localPath));
    expect(persisted.equals(buffer)).toBe(true);
  });

  it('uploadToMeta error de Meta → WapiMediaException META_UPLOAD_FAILED', async () => {
    fetchMock.mockResolvedValueOnce(
      mkResponse(400, { error: { code: 100, message: 'Bad upload' } }),
    );
    await expect(
      TenantContext.run(ctx, () =>
        svc.uploadToMeta({
          configId: 'cfg1',
          type: 'image',
          buffer: Buffer.from('x'),
          mime: 'image/jpeg',
          filename: 'x.jpg',
        }),
      ),
    ).rejects.toMatchObject({ code: 'META_UPLOAD_FAILED' });
  });

  it('fetchInboundMedia: dos calls (info + binary) → persiste local', async () => {
    const buffer = Buffer.from('inbound-bytes');
    fetchMock
      .mockResolvedValueOnce(
        mkResponse(200, {
          url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc',
          mime_type: 'image/png',
          file_size: buffer.length,
        }),
      )
      .mockResolvedValueOnce(mkBinResponse(200, buffer));

    const out = await TenantContext.run(ctx, () =>
      svc.fetchInboundMedia('cfg1', 'meta-id-456'),
    );
    expect(out.mime).toBe('image/png');
    expect(out.size).toBe(buffer.length);
    expect(out.localPath).toMatch(/\.png$/);
    const persisted = await fs.readFile(path.join(tmpDir, out.localPath));
    expect(persisted.equals(buffer)).toBe(true);
  });

  it('uploadToMeta dos veces con mismo buffer → no re-escribe (idempotente)', async () => {
    fetchMock
      .mockResolvedValueOnce(mkResponse(200, { id: 'm1' }))
      .mockResolvedValueOnce(mkResponse(200, { id: 'm2' }));
    const buffer = Buffer.from('same-content');
    const r1 = await TenantContext.run(ctx, () =>
      svc.uploadToMeta({
        configId: 'cfg1',
        type: 'image',
        buffer,
        mime: 'image/jpeg',
        filename: 'a.jpg',
      }),
    );
    const stat1 = await fs.stat(path.join(tmpDir, r1.localPath));
    // Pequeño delay para detectar si se re-escribe (mtime cambia).
    await new Promise((r) => setTimeout(r, 10));
    const r2 = await TenantContext.run(ctx, () =>
      svc.uploadToMeta({
        configId: 'cfg1',
        type: 'image',
        buffer,
        mime: 'image/jpeg',
        filename: 'b.jpg',
      }),
    );
    const stat2 = await fs.stat(path.join(tmpDir, r2.localPath));
    expect(r1.sha256).toBe(r2.sha256);
    expect(r1.localPath).toBe(r2.localPath);
    expect(stat1.mtimeMs).toBe(stat2.mtimeMs);
  });
});
