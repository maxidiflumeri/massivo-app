import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SkipTenantScope } from '../../../common/auth/skip-tenant-scope.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { WapiWebhookService, type ResolvedWebhookConfig } from './wapi-webhook.service';
import type { WapiWebhookPayload } from './wapi-webhook.types';

/**
 * Webhook Meta WhatsApp Cloud API. Endpoint público — Meta no manda
 * Authorization Bearer.
 *
 * **URL única para todo el SaaS**: Meta solo permite registrar UN webhook URL
 * por App. Como dos `WapiConfig` distintas pueden compartir App (mismo
 * `appSecret` y `webhookVerifyToken`), no podemos identificar el config en la
 * URL. La resolución es:
 *  - **GET verify**: el `hub.verify_token` que manda Meta es el secreto —
 *    matcheamos contra el `webhookVerifyTokenEnc` decriptado de cualquier
 *    `WapiConfig` activa. Si matchea alguna, devolvemos el challenge.
 *  - **POST events**: el payload trae `entry[].changes[].value.metadata.phone_number_id`
 *    para cada evento. Ese `phoneNumberId` es único globalmente en Meta — lo
 *    usamos para resolver el `WapiConfig` (y por ende organizationId/teamId).
 *    HMAC se valida con el `appSecret` del primer config encontrado: todos los
 *    configs de la misma App lo comparten, así que cualquiera sirve.
 *
 * Sin Clerk, sin tenant guard. `@SkipTenantScope` para que el cliente raíz lea
 * los configs antes de reconstruir el TenantContext en el service (per-entry,
 * porque un mismo POST puede traer eventos de varios números).
 *
 * Siempre 200 si la firma es válida — devolver 4xx/5xx hace que Meta reintente
 * agresivo (y eventualmente deshabilite el webhook si el ratio de errores es alto).
 */
@Controller('webhooks/wapi')
@SkipTenantScope()
export class WapiWebhookController {
  private readonly logger = new Logger(WapiWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly webhook: WapiWebhookService,
  ) {}

  /**
   * Endpoint de verificación. Meta llama esto cuando se registra el webhook
   * en el dashboard de la App. Ver:
   * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
   *
   * Como puede haber N `WapiConfig`, escaneamos todas las activas y comparamos
   * timing-safe contra el verifyToken de cada una. La primera que matchee gana.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    if (mode !== 'subscribe') {
      throw new BadRequestException(`hub.mode=${mode} no soportado`);
    }
    const configs = await this.prisma.wapiConfig.findMany({
      where: { isActive: true },
      select: { id: true, webhookVerifyTokenEnc: true },
    });
    for (const cfg of configs) {
      const expected = this.encryption.decrypt(cfg.webhookVerifyTokenEnc);
      if (safeStringEqual(token, expected)) {
        this.logger.log(`Webhook Meta verificado (matched config ${cfg.id})`);
        return challenge;
      }
    }
    this.logger.warn(`verify_token no matchea ninguna WapiConfig activa`);
    throw new ForbiddenException('verify_token inválido');
  }

  /**
   * Recepción de eventos. Meta valida el endpoint con SHA256 HMAC del cuerpo
   * RAW (no del JSON parseado — el orden de keys importa). Por eso `main.ts`
   * tiene `rawBody:true` y acá leemos `req.rawBody`.
   *
   * Resolución de tenant: extraemos los `phone_number_id` de cada entry y
   * buscamos los `WapiConfig` correspondientes. HMAC se valida con el
   * `appSecret` del primer config; todos los demás configs de la misma App
   * comparten ese secreto.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: true }> {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('rawBody no disponible');
    }

    let payload: WapiWebhookPayload;
    try {
      payload = JSON.parse(raw.toString('utf8')) as WapiWebhookPayload;
    } catch {
      throw new BadRequestException('payload no es JSON válido');
    }
    if (payload?.object !== 'whatsapp_business_account') {
      // Meta también puede mandar eventos de otros productos si la app suscribe
      // varios — los ignoramos sin error.
      this.logger.debug(`payload object=${payload?.object} ignorado`);
      return { ok: true };
    }

    const phoneNumberIds = collectPhoneNumberIds(payload);
    if (phoneNumberIds.size === 0) {
      this.logger.debug('payload sin phone_number_id, ignorado');
      return { ok: true };
    }

    const configs = await this.prisma.wapiConfig.findMany({
      where: { phoneNumberId: { in: [...phoneNumberIds] } },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        phoneNumberId: true,
        appSecretEnc: true,
      },
    });
    if (configs.length === 0) {
      this.logger.warn(
        `webhook sin WapiConfig matching phone_number_ids=${[...phoneNumberIds].join(',')}`,
      );
      throw new NotFoundException('config no encontrada');
    }

    const firstCfg = configs[0]!;
    if (firstCfg.appSecretEnc) {
      const appSecret = this.encryption.decrypt(firstCfg.appSecretEnc);
      if (!signature || !verifySignature(signature, raw, appSecret)) {
        this.logger.warn(`firma inválida (probada contra config ${firstCfg.id})`);
        throw new ForbiddenException('signature mismatch');
      }
    } else {
      // Sin appSecret configurado, no hay forma de validar — log y aceptar
      // sólo en dev. Producción debería tener appSecret obligatorio.
      this.logger.warn(
        `WapiConfig ${firstCfg.id} sin appSecret — webhook acepta sin verificar firma (NO usar en prod)`,
      );
    }

    const map = new Map<string, ResolvedWebhookConfig>(
      configs.map((c) => [
        c.phoneNumberId,
        {
          configId: c.id,
          organizationId: c.organizationId,
          teamId: c.teamId,
        },
      ]),
    );
    await this.webhook.process(payload, map);
    return { ok: true };
  }
}

function collectPhoneNumberIds(payload: WapiWebhookPayload): Set<string> {
  const ids = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) ids.add(id);
    }
  }
  return ids;
}

function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifySignature(header: string, raw: Buffer, appSecret: string): boolean {
  // Meta envía `sha256=<hex>`. Calculamos HMAC del rawBody con el appSecret.
  if (!header.startsWith('sha256=')) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(raw).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
