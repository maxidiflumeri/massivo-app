/**
 * Tests del WapiTemplatesPostingService.
 *  - sin tenant context → ForbiddenException.
 *  - config no existe → NotFoundException.
 *  - name ya existe en (teamId, biz) → ConflictException.
 *  - happy: header TEXT + body con vars + footer + 3 botones → POST a Meta y persiste.
 *  - header IMAGE/VIDEO/DOCUMENT sin mediaHandle → BadRequest.
 *  - header IMAGE con mediaHandle → header_handle en payload Meta.
 *  - button URL sin url → BadRequest.
 *  - button PHONE_NUMBER sin phoneNumber → BadRequest.
 *  - button QUICK_REPLY → sólo {type, text} en payload.
 *  - Graph API 400 → ServiceUnavailableException con mensaje Meta.
 *  - decripta accessToken con EncryptionService antes de POST.
 *  - status default PENDING si Meta no devuelve status.
 *  - body sin examples → no incluye example.body_text.
 */
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiTemplatesPostingService } from './wapi-templates-posting.service';
import type { CreateWapiTemplateMetaDto } from './wapi-templates-posting.dto';
import type { RequestContext } from '@massivo/shared-types';

describe('WapiTemplatesPostingService', () => {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: 'org-a',
    teamId: 'team-a',
    orgRole: 'MEMBER',
    teamRole: 'ADMIN',
  };

  let prismaScoped: {
    wapiConfig: { findFirst: jest.Mock };
    wapiTemplate: { findFirst: jest.Mock; create: jest.Mock };
  };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock; isEncrypted: jest.Mock };
  let svc: WapiTemplatesPostingService;
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prismaScoped = {
      wapiConfig: { findFirst: jest.fn() },
      wapiTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) =>
          Promise.resolve({ id: 'tpl-1', ...(data as object) }),
        ),
      },
    };
    encryption = {
      encrypt: jest.fn((v: string) => v),
      decrypt: jest.fn((v: string) => v),
      isEncrypted: jest.fn(() => false),
    };
    svc = new WapiTemplatesPostingService(
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

  const baseDto: CreateWapiTemplateMetaDto = {
    name: 'welcome_v1',
    language: 'es_AR',
    category: 'MARKETING',
    body: { text: 'Hola {{1}}', examples: [['Ana']] },
  };

  it('sin tenant context → ForbiddenException', async () => {
    await expect(svc.submit('cfg-1', baseDto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('config no existe → NotFoundException', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(null);
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-x', baseDto)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('name ya existe en (teamId, biz) → ConflictException', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    prismaScoped.wapiTemplate.findFirst.mockResolvedValueOnce({ id: 't-existing', status: 'APPROVED' });
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', baseDto)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaScoped.wapiTemplate.create).not.toHaveBeenCalled();
  });

  it('happy: header TEXT + body + footer + 3 botones → POST y persiste', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(
      mkResponse(201, { id: 'meta-id-1', status: 'PENDING', category: 'MARKETING' }),
    );

    const dto: CreateWapiTemplateMetaDto = {
      name: 'full_template',
      language: 'es_AR',
      category: 'MARKETING',
      header: { format: 'TEXT', text: 'Hola {{1}}', textExamples: ['Ana'] },
      body: { text: 'Mensaje {{1}}', examples: [['Ana']] },
      footer: { text: 'Footer text' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Sí' },
        { type: 'URL', text: 'Ir', url: 'https://example.com' },
        { type: 'PHONE_NUMBER', text: 'Llamar', phoneNumber: '+5491100000000' },
      ],
    };

    const out = await TenantContext.run(ctx, () => svc.submit('cfg-1', dto));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/biz-1\/message_templates/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-plain');

    const body = JSON.parse(init.body);
    expect(body.name).toBe('full_template');
    expect(body.language).toBe('es_AR');
    expect(body.category).toBe('MARKETING');
    expect(body.components).toEqual([
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Hola {{1}}',
        example: { header_text: ['Ana'] },
      },
      {
        type: 'BODY',
        text: 'Mensaje {{1}}',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Footer text' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Sí' },
          { type: 'URL', text: 'Ir', url: 'https://example.com' },
          { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+5491100000000' },
        ],
      },
    ]);

    expect(prismaScoped.wapiTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metaName: 'full_template',
        businessAccountId: 'biz-1',
        category: 'MARKETING',
        language: 'es_AR',
        status: 'PENDING',
      }),
    });
    expect(out).toMatchObject({ id: 'tpl-1', metaName: 'full_template' });
  });

  it('header IMAGE sin mediaHandle → BadRequest', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      header: { format: 'IMAGE' },
    };
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', dto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('header IMAGE con mediaHandle → header_handle en payload', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(mkResponse(201, { id: 'm', status: 'PENDING' }));

    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      name: 'with_image',
      header: { format: 'IMAGE', mediaHandle: 'handle-abc' },
    };
    await TenantContext.run(ctx, () => svc.submit('cfg-1', dto));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.components[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['handle-abc'] },
    });
  });

  it('header TEXT sin text → BadRequest', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      header: { format: 'TEXT' },
    };
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', dto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('button URL sin url → BadRequest', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      buttons: [{ type: 'URL', text: 'Ir' }],
    };
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', dto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('button PHONE_NUMBER sin phoneNumber → BadRequest', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      buttons: [{ type: 'PHONE_NUMBER', text: 'Llamar' }],
    };
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', dto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Graph API 400 → ServiceUnavailableException con mensaje Meta', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(
      mkResponse(400, { error: { code: 100, message: 'Invalid parameter' } }),
    );
    await expect(
      TenantContext.run(ctx, () => svc.submit('cfg-1', baseDto)),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      message: expect.stringContaining('Invalid parameter'),
    });
    expect(prismaScoped.wapiTemplate.create).not.toHaveBeenCalled();
  });

  it('decripta accessToken antes de POST', async () => {
    const cfg = mkConfig();
    cfg.accessTokenEnc = 'enc(real-token)';
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(cfg);
    encryption.decrypt.mockImplementationOnce((v: string) => v.replace(/^enc\(|\)$/g, ''));
    fetchMock.mockResolvedValueOnce(mkResponse(201, { id: 'm', status: 'PENDING' }));

    await TenantContext.run(ctx, () => svc.submit('cfg-1', baseDto));
    expect(encryption.decrypt).toHaveBeenCalledWith('enc(real-token)');
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer real-token');
  });

  it('Meta no devuelve status → persist con PENDING default', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(mkResponse(201, { id: 'm' })); // sin status

    await TenantContext.run(ctx, () => svc.submit('cfg-1', baseDto));
    expect(prismaScoped.wapiTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PENDING' }),
    });
  });

  it('body sin examples → no incluye example.body_text', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(mkResponse(201, { id: 'm', status: 'PENDING' }));

    const dto: CreateWapiTemplateMetaDto = {
      name: 'no_vars',
      language: 'es',
      category: 'UTILITY',
      body: { text: 'Texto fijo sin vars' },
    };
    await TenantContext.run(ctx, () => svc.submit('cfg-1', dto));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.components).toEqual([{ type: 'BODY', text: 'Texto fijo sin vars' }]);
  });

  it('header NONE → no se incluye HEADER component', async () => {
    prismaScoped.wapiConfig.findFirst.mockResolvedValueOnce(mkConfig());
    fetchMock.mockResolvedValueOnce(mkResponse(201, { id: 'm', status: 'PENDING' }));

    const dto: CreateWapiTemplateMetaDto = {
      ...baseDto,
      name: 'no_header',
      header: { format: 'NONE' },
    };
    await TenantContext.run(ctx, () => svc.submit('cfg-1', dto));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.components.find((c: { type: string }) => c.type === 'HEADER')).toBeUndefined();
  });
});
