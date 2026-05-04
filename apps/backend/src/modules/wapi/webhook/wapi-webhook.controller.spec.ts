/**
 * Tests del WapiWebhookController.
 *  - GET verify: token correcto matchea contra cualquier config activa →
 *    devuelve challenge; sin match → 403; mode!=subscribe → 400.
 *  - POST receive: lookup de configs por phone_number_id en el payload.
 *    HMAC válido → llama service; inválido → 403; sin appSecret → modo dev;
 *    payload object distinto → ignorado; multi-config (mismo App, dos
 *    números) → procesa ambos.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WapiWebhookController } from './wapi-webhook.controller';

describe('WapiWebhookController', () => {
  let prisma: { wapiConfig: { findMany: jest.Mock } };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock; isEncrypted: jest.Mock };
  let webhook: { process: jest.Mock };
  let ctl: WapiWebhookController;

  beforeEach(() => {
    prisma = { wapiConfig: { findMany: jest.fn() } };
    encryption = {
      encrypt: jest.fn((v: string) => v),
      decrypt: jest.fn((v: string) => v),
      isEncrypted: jest.fn(() => false),
    };
    webhook = { process: jest.fn().mockResolvedValue(undefined) };
    ctl = new WapiWebhookController(prisma as never, encryption as never, webhook as never);
  });

  describe('GET — verify (URL única)', () => {
    it('token correcto matchea una config activa → devuelve challenge', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'verify-secret' },
      ]);
      const out = await ctl.verify('subscribe', 'verify-secret', 'CHAL-1');
      expect(out).toBe('CHAL-1');
    });

    it('token correcto matchea la 2ª config (escanea todas)', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'token-A' },
        { id: 'cfg-2', webhookVerifyTokenEnc: 'token-B' },
      ]);
      const out = await ctl.verify('subscribe', 'token-B', 'CHAL-2');
      expect(out).toBe('CHAL-2');
    });

    it('token sin match → 403', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', webhookVerifyTokenEnc: 'token-A' },
      ]);
      await expect(
        ctl.verify('subscribe', 'malo', 'CHAL'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin configs activas → 403', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([]);
      await expect(
        ctl.verify('subscribe', 'cualquiera', 'CHAL'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mode != subscribe → 400', async () => {
      await expect(
        ctl.verify('unsubscribe', 't', 'c'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('POST — receive', () => {
    function makeReq(rawBody: Buffer): { rawBody: Buffer } {
      return { rawBody };
    }

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

    it('firma válida → llama service con map y 200', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        {
          id: 'cfg-1',
          organizationId: 'org-a',
          teamId: 'team-a',
          phoneNumberId: 'pn-100',
          appSecretEnc: 'sec',
        },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      const out = await ctl.receive(sign(raw, 'sec'), makeReq(raw) as never);
      expect(out).toEqual({ ok: true });
      expect(webhook.process).toHaveBeenCalledTimes(1);
      const [, mapArg] = webhook.process.mock.calls[0]!;
      expect(mapArg.get('pn-100')).toEqual({
        configId: 'cfg-1',
        organizationId: 'org-a',
        teamId: 'team-a',
      });
    });

    it('multi-config (mismo App, dos números) → carga ambos en el map', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
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
      const out = await ctl.receive(sign(raw, 'shared-sec'), makeReq(raw) as never);
      expect(out).toEqual({ ok: true });
      const [, mapArg] = webhook.process.mock.calls[0]!;
      expect(mapArg.size).toBe(2);
      expect(mapArg.get('pn-A').configId).toBe('cfg-A');
      expect(mapArg.get('pn-B').configId).toBe('cfg-B');
    });

    it('firma inválida → 403 sin llamar service', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', organizationId: 'org-a', teamId: 'team-a', phoneNumberId: 'pn-100', appSecretEnc: 'sec' },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      await expect(
        ctl.receive('sha256=deadbeef', makeReq(raw) as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('sin appSecret en config → acepta sin verificar (modo dev)', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([
        { id: 'cfg-1', organizationId: 'org-a', teamId: 'team-a', phoneNumberId: 'pn-100', appSecretEnc: null },
      ]);
      const raw = Buffer.from(payloadFor('pn-100'), 'utf8');
      const out = await ctl.receive(undefined, makeReq(raw) as never);
      expect(out).toEqual({ ok: true });
      expect(webhook.process).toHaveBeenCalled();
    });

    it('payload object != whatsapp_business_account → ignorado sin tocar DB', async () => {
      const raw = Buffer.from('{"object":"otra-cosa","entry":[]}');
      const out = await ctl.receive(undefined, makeReq(raw) as never);
      expect(out).toEqual({ ok: true });
      expect(prisma.wapiConfig.findMany).not.toHaveBeenCalled();
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('payload sin phone_number_id → ignorado sin tocar DB', async () => {
      const raw = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
      const out = await ctl.receive(undefined, makeReq(raw) as never);
      expect(out).toEqual({ ok: true });
      expect(prisma.wapiConfig.findMany).not.toHaveBeenCalled();
      expect(webhook.process).not.toHaveBeenCalled();
    });

    it('payload no JSON → 400', async () => {
      const raw = Buffer.from('no-json{');
      await expect(
        ctl.receive(undefined, makeReq(raw) as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('phone_number_id sin config matching → 404', async () => {
      prisma.wapiConfig.findMany.mockResolvedValueOnce([]);
      const raw = Buffer.from(payloadFor('pn-fantasma'), 'utf8');
      await expect(
        ctl.receive(undefined, makeReq(raw) as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
