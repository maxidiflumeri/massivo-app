/**
 * Tests del WhatsAppWebhookHandler (1c — extraído de WapiWebhookController).
 *  - 4.P: rutas org-scoped por slug. Verify y receive sólo evalúan WapiConfig
 *    de la org dueña del slug. Slug inexistente → 404. Cache TTL 60s.
 *  - GET verify: token correcto matchea contra cualquier config activa **de la
 *    misma org** → devuelve challenge; sin match → 403; mode!=subscribe → 400.
 *  - POST receive: lookup de configs por phone_number_id **scopeado a la org**.
 *    HMAC válido → llama service; inválido → 403; sin appSecret → modo dev.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WhatsAppWebhookHandler } from './whatsapp-webhook.handler';

describe('WhatsAppWebhookHandler', () => {
  let prisma: {
    organization: { findUnique: jest.Mock };
    channel: { findMany: jest.Mock };
  };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock; isEncrypted: jest.Mock };
  let webhook: { process: jest.Mock };
  let handler: WhatsAppWebhookHandler;

  const SLUG = 'wbh_AAAAAAAAAAAAAAAAAAAAAAAA';

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-a' }),
      },
      channel: { findMany: jest.fn() },
    };
    encryption = {
      encrypt: jest.fn((v: string) => v),
      decrypt: jest.fn((v: string) => v),
      isEncrypted: jest.fn(() => false),
    };
    webhook = { process: jest.fn().mockResolvedValue(undefined) };
    handler = new WhatsAppWebhookHandler(prisma as never, encryption as never, webhook as never);
  });

  describe('verify (org-scoped por slug)', () => {
    it('token correcto matchea una config activa de la org → devuelve challenge', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'verify-secret' },
      ]);
      const out = await handler.verify(SLUG, 'subscribe', 'verify-secret', 'CHAL-1');
      expect(out).toBe('CHAL-1');
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { webhookSlug: SLUG },
        select: { id: true },
      });
      expect(prisma.channel.findMany.mock.calls[0]![0].where).toMatchObject({
        organizationId: 'org-a',
        isActive: true,
      });
    });

    it('slug inexistente → 404', async () => {
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      await expect(
        handler.verify('wbh_inexistente', 'subscribe', 't', 'c'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('token correcto matchea la 2ª config (escanea todas las de la org)', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'token-A' },
        { id: 'cfg-2', webhookVerifyTokenEnc: 'token-B' },
      ]);
      const out = await handler.verify(SLUG, 'subscribe', 'token-B', 'CHAL-2');
      expect(out).toBe('CHAL-2');
    });

    it('token sin match → 403', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'token-A' },
      ]);
      await expect(
        handler.verify(SLUG, 'subscribe', 'malo', 'CHAL'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin configs activas en la org → 403', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([]);
      await expect(
        handler.verify(SLUG, 'subscribe', 'cualquiera', 'CHAL'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mode != subscribe → 400 sin tocar DB', async () => {
      await expect(
        handler.verify(SLUG, 'unsubscribe', 't', 'c'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('receive (org-scoped por slug)', () => {
    function sign(raw: Buffer, secret: string): string {
      return 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    }

    function payloadFor(phoneNumberId: string, extra: Record<string, unknown> = {}): string {
      return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'biz-1',
            changes: [
              {
                field: 'messages',
                value: { metadata: { phone_number_id: phoneNumberId }, ...extra },
              },
            ],
          },
        ],
      });
    }

    it('firma válida → llama service con map y 200, scoping por orgId', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        {
          id: 'cfg-1',
          organizationId: 'org-a',
          teamId: 'team-a',
          phoneNumberId: 'pn-100',
          appSecretEnc: 'sec',
        },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      const out = await handler.receive(SLUG, sign(raw, 'sec'), raw);
      expect(out).toEqual({ ok: true });
      expect(prisma.channel.findMany.mock.calls[0]![0].where).toMatchObject({
        organizationId: 'org-a',
      });
      expect(webhook.process).toHaveBeenCalledTimes(1);
      const [, mapArg] = webhook.process.mock.calls[0]!;
      expect(mapArg.get('pn-100')).toEqual({
        configId: 'cfg-1',
        organizationId: 'org-a',
        teamId: 'team-a',
      });
    });

    it('slug inexistente → 404 antes de tocar wapiConfig', async () => {
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      await expect(
        handler.receive('wbh_xxx', undefined, raw),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.channel.findMany).not.toHaveBeenCalled();
    });

    it('multi-config (mismo App, dos números, misma org) → carga ambos en el map', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        {
          id: 'cfg-A',
          organizationId: 'org-a',
          teamId: 'team-a',
          phoneNumberId: 'pn-A',
          appSecretEnc: 'shared-sec',
        },
        {
          id: 'cfg-B',
          organizationId: 'org-a',
          teamId: 'team-a',
          phoneNumberId: 'pn-B',
          appSecretEnc: 'shared-sec',
        },
      ]);
      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          { id: 'biz-1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn-A' } } }] },
          { id: 'biz-1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn-B' } } }] },
        ],
      });
      const raw = Buffer.from(body, 'utf8');
      const out = await handler.receive(SLUG, sign(raw, 'shared-sec'), raw);
      expect(out).toEqual({ ok: true });
      const [, mapArg] = webhook.process.mock.calls[0]!;
      expect(mapArg.size).toBe(2);
      expect(mapArg.get('pn-A').configId).toBe('cfg-A');
      expect(mapArg.get('pn-B').configId).toBe('cfg-B');
    });

    it('firma inválida → 403 sin llamar service', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', organizationId: 'org-a', teamId: 'team-a', phoneNumberId: 'pn-100', appSecretEnc: 'sec' },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      await expect(
        handler.receive(SLUG, 'sha256=deadbeef', raw),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('sin appSecret en config → acepta sin verificar (modo dev)', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', organizationId: 'org-a', teamId: 'team-a', phoneNumberId: 'pn-100', appSecretEnc: null },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      const out = await handler.receive(SLUG, undefined, raw);
      expect(out).toEqual({ ok: true });
      expect(webhook.process).toHaveBeenCalled();
    });

    it('payload object != whatsapp_business_account → ignorado sin tocar DB', async () => {
      const raw = Buffer.from('{"object":"otra-cosa","entry":[]}');
      const out = await handler.receive(SLUG, undefined, raw);
      expect(out).toEqual({ ok: true });
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
      expect(prisma.channel.findMany).not.toHaveBeenCalled();
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('payload sin phone_number_id → ignorado sin tocar DB', async () => {
      const raw = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
      const out = await handler.receive(SLUG, undefined, raw);
      expect(out).toEqual({ ok: true });
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
      expect(prisma.channel.findMany).not.toHaveBeenCalled();
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('payload no JSON → 400', async () => {
      const raw = Buffer.from('no-json{');
      await expect(
        handler.receive(SLUG, undefined, raw),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rawBody ausente → 400', async () => {
      await expect(handler.receive(SLUG, undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('phone_number_id sin config matching en la org → 404', async () => {
      prisma.channel.findMany.mockResolvedValueOnce([]);
      const raw = Buffer.from(payloadFor('pn-fantasma'), 'utf8');
      await expect(
        handler.receive(SLUG, undefined, raw),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cache slug→orgId: segunda llamada no re-consulta organization', async () => {
      prisma.channel.findMany.mockResolvedValue([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'verify-secret' },
      ]);
      await handler.verify(SLUG, 'subscribe', 'verify-secret', 'A');
      await handler.verify(SLUG, 'subscribe', 'verify-secret', 'B');
      expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
