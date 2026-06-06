import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { WapiWebhookService, type ResolvedWebhookConfig } from './wapi-webhook.service';
import type { WapiWebhookPayload } from './wapi-webhook.types';

/**
 * 1c — Lógica del webhook de WhatsApp (Meta Cloud API), extraída del controller
 * para que la compartan **dos rutas**:
 *  - `/api/webhooks/wapi/:slug` (alias legacy → `WapiWebhookController`)
 *  - `/api/channels/whatsapp/:slug` (genérica → `ChannelsWebhookController`)
 *
 * Es específica de WhatsApp/Meta (verifyToken, appSecret HMAC, phone_number_id).
 * Cuando exista el modelo `Channel` unificado (1d), la resolución de tenant pasa
 * a ser channel-aware y esto se pliega al `verifyAndParse(req, channel)` del
 * diseño. Por ahora resuelve contra `WapiConfig` igual que antes.
 *
 * **4.P — URL org-scoped**: cada organización tiene su `webhookSlug` opaco
 * (`wbh_<24chars>`). El slug filtra el universo de `WapiConfig` para verify/HMAC.
 *
 * Siempre 200 si la firma es válida — devolver 4xx/5xx hace que Meta reintente
 * agresivo (y eventualmente deshabilite el webhook si el ratio de errores es alto).
 */
@Injectable()
export class WhatsAppWebhookHandler {
  private readonly logger = new Logger(WhatsAppWebhookHandler.name);

  /** 4.P — cache slug → organizationId. TTL 60s. Evita lookup en cada POST de Meta. */
  private readonly slugCache = new Map<string, { orgId: string; expiresAt: number }>();
  private static readonly SLUG_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly webhook: WapiWebhookService,
  ) {}

  /** GET de verificación de Meta: matchea `hub.verify_token` contra los configs
   *  activos de la org dueña del slug; devuelve el challenge si alguno coincide. */
  async verify(slug: string, mode: string, token: string, challenge: string): Promise<string> {
    if (mode !== 'subscribe') {
      throw new BadRequestException(`hub.mode=${mode} no soportado`);
    }
    const orgId = await this.resolveOrgIdBySlug(slug);
    const configs = await this.prisma.channel.findMany({
      where: { isActive: true, organizationId: orgId },
      select: { id: true, webhookVerifyTokenEnc: true },
    });
    for (const cfg of configs) {
      const expected = this.encryption.decrypt(cfg.webhookVerifyTokenEnc);
      if (safeStringEqual(token, expected)) {
        this.logger.log(`Webhook Meta verificado (slug=${slug}, config=${cfg.id})`);
        return challenge;
      }
    }
    this.logger.warn(`verify_token no matchea WapiConfig activa para slug=${slug}`);
    throw new ForbiddenException('verify_token inválido');
  }

  /** POST de eventos: valida firma HMAC y delega el payload a `WapiWebhookService`. */
  async receive(
    slug: string,
    signature: string | undefined,
    raw: Buffer | undefined,
  ): Promise<{ ok: true }> {
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
      this.logger.debug(`payload object=${payload?.object} ignorado`);
      return { ok: true };
    }

    const phoneNumberIds = collectPhoneNumberIds(payload);
    if (phoneNumberIds.size === 0) {
      this.logger.debug('payload sin phone_number_id, ignorado');
      return { ok: true };
    }

    const orgId = await this.resolveOrgIdBySlug(slug);
    const configs = await this.prisma.channel.findMany({
      where: {
        organizationId: orgId,
        phoneNumberId: { in: [...phoneNumberIds] },
      },
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
        `webhook slug=${slug} sin WapiConfig matching phone_number_ids=${[...phoneNumberIds].join(',')}`,
      );
      throw new NotFoundException('config no encontrada');
    }

    const firstCfg = configs[0]!;
    if (firstCfg.appSecretEnc) {
      const appSecret = this.encryption.decrypt(firstCfg.appSecretEnc);
      if (!signature || !verifySignature(signature, raw, appSecret)) {
        this.logger.warn(`firma inválida (slug=${slug}, config=${firstCfg.id})`);
        throw new ForbiddenException('signature mismatch');
      }
    } else {
      this.logger.warn(
        `WapiConfig ${firstCfg.id} sin appSecret — webhook acepta sin verificar firma (NO usar en prod)`,
      );
    }

    const map = new Map<string, ResolvedWebhookConfig>(
      configs.map((c) => [
        c.phoneNumberId!,
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

  /**
   * Resuelve `webhookSlug → organizationId` con cache in-memory TTL 60s.
   * 404 si no existe — el slug es opaco así que no leakeamos info.
   */
  private async resolveOrgIdBySlug(slug: string): Promise<string> {
    const now = Date.now();
    const cached = this.slugCache.get(slug);
    if (cached && cached.expiresAt > now) {
      return cached.orgId;
    }
    const org = await this.prisma.organization.findUnique({
      where: { webhookSlug: slug },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException('webhook no encontrado');
    }
    this.slugCache.set(slug, {
      orgId: org.id,
      expiresAt: now + WhatsAppWebhookHandler.SLUG_CACHE_TTL_MS,
    });
    return org.id;
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
  if (!header.startsWith('sha256=')) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(raw).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
