/**
 * Tests del WapiTemplatesSyncService.
 *  - happy path 1 página: 2 templates → 2 created.
 *  - paginación: 1ª página con paging.next → 2ª página → 3 templates totales.
 *  - existing igual → skipped (no escribe).
 *  - existing distinto → updated.
 *  - sin tenant context → ForbiddenException.
 *  - config no existe → NotFoundException.
 *  - Graph API 401 → ServiceUnavailableException.
 *  - safety guard: paging infinito se corta en MAX_PAGES.
 */
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiTemplatesSyncService } from './wapi-templates-sync.service';
import type { RequestContext } from '@massivo/shared-types';

describe('WapiTemplatesSyncService', () => {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org-a',
    teamId: 'team-a',
    orgRole: 'MEMBER',
    teamRole: 'ADMIN',
  };

  let prismaScoped: {
    wapiConfig: { findFirst: jest.Mock };
    wapiTemplate: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock; isEncrypted: jest.Mock };
  let svc: WapiTemplatesSyncService;
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prismaScoped = {
      wapiConfig: { findFirst: jest.fn() },
      wapiTemplate: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    encryption = {
      encrypt: jest.fn((v: string) => v),
      decrypt: jest.fn((v: string) => v),
      isEncrypted: jest.fn(() => false),
    };
    svc = new WapiTemplatesSyncService(
      new ConfigService({}),
      { scoped: prismaScoped } as never,
      encryption as never,
    );
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

  function mkConfig() {
    return {
      id: 'cfg-1',
      businessAccountId: 'biz-1',
      accessTokenEnc: 'tok-plain',
    };
  }

  it('sin tenant context → ForbiddenException', async () => {
    await expect(svc.sync('cfg-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('config no existe → NotFoundException', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(null);
    await expect(
      TenantContext.run(ctx, () => svc.sync('cfg-x')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('happy path 1 página: 2 templates nuevos → 2 created', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(
      mkResponse(200, {
        data: [
          { name: 'welcome', status: 'APPROVED', language: 'es', category: 'MARKETING', components: [{ type: 'BODY', text: 'Hola {{1}}' }] },
          { name: 'reminder', status: 'PENDING', language: 'en', category: 'UTILITY', components: [] },
        ],
      }),
    );

    const out = await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(out).toEqual({ fetched: 2, created: 2, updated: 0, skipped: 0, pages: 1 });
    expect(prismaScoped.wapiTemplate.create).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/biz-1\/message_templates/);
    expect(url).toMatch(/fields=name/);
    expect(init.headers.Authorization).toBe('Bearer tok-plain');
  });

  it('paginación: 2ª página vía paging.next', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(
        mkResponse(200, {
          data: [{ name: 't1', status: 'APPROVED', language: 'es', category: 'X', components: [] }],
          paging: { next: 'https://graph.facebook.com/v20.0/biz-1/message_templates?after=abc' },
        }),
      )
      .mockResolvedValueOnce(
        mkResponse(200, {
          data: [
            { name: 't2', status: 'APPROVED', language: 'es', category: 'X', components: [] },
            { name: 't3', status: 'APPROVED', language: 'es', category: 'X', components: [] },
          ],
        }),
      );

    const out = await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(out).toEqual({ fetched: 3, created: 3, updated: 0, skipped: 0, pages: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toMatch(/after=abc/);
  });

  it('existing idéntico → skipped (no update)', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValueOnce({
      id: 't-existing',
      status: 'APPROVED',
      language: 'es',
      category: 'X',
      components: [{ type: 'BODY', text: 'A' }],
    });
    fetchMock.mockResolvedValueOnce(
      mkResponse(200, {
        data: [
          { name: 'same', status: 'APPROVED', language: 'es', category: 'X', components: [{ type: 'BODY', text: 'A' }] },
        ],
      }),
    );
    const out = await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(out).toMatchObject({ fetched: 1, created: 0, updated: 0, skipped: 1 });
    expect(prismaScoped.wapiTemplate.update).not.toHaveBeenCalled();
    expect(prismaScoped.wapiTemplate.create).not.toHaveBeenCalled();
  });

  it('existing con status distinto → updated', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValueOnce({
      id: 't-existing', status: 'PENDING', language: 'es', category: 'X', components: [],
    });
    fetchMock.mockResolvedValueOnce(
      mkResponse(200, {
        data: [{ name: 'tpl', status: 'APPROVED', language: 'es', category: 'X', components: [] }],
      }),
    );
    const out = await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(out).toMatchObject({ updated: 1, created: 0 });
    expect(prismaScoped.wapiTemplate.update).toHaveBeenCalledWith({
      where: { id: 't-existing' },
      data: expect.objectContaining({ status: 'APPROVED' }),
    });
  });

  it('Graph API 401 → ServiceUnavailableException', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(
      mkResponse(401, { error: { code: 190, message: 'Invalid OAuth' } }),
    );
    await expect(
      TenantContext.run(ctx, () => svc.sync('cfg-1')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prismaScoped.wapiTemplate.create).not.toHaveBeenCalled();
  });

  it('safety guard MAX_PAGES: paging.next infinito se corta', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      mkResponse(200, {
        data: [{ name: 'loop', status: 'APPROVED', language: 'es', category: 'X', components: [] }],
        paging: { next: 'https://graph.facebook.com/v20.0/biz-1/message_templates?after=loop' },
      }),
    );
    const out = await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(out.pages).toBe(5); // MAX_PAGES
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('decripta accessToken con EncryptionService antes de llamar', async () => {
    const cfg = mkConfig();
    cfg.accessTokenEnc = 'enc(real-token)';
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(cfg);
    encryption.decrypt.mockImplementationOnce((v: string) => v.replace(/^enc\(|\)$/g, ''));
    fetchMock.mockResolvedValueOnce(mkResponse(200, { data: [] }));
    await TenantContext.run(ctx, () => svc.sync('cfg-1'));
    expect(encryption.decrypt).toHaveBeenCalledWith('enc(real-token)');
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer real-token');
  });
});
