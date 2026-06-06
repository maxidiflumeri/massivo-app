import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestContext } from '@massivo/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { MessengerAdapter } from './adapters/messenger.adapter';
import { ConversationIngestService, type IngestChannel } from './conversation-ingest.service';

/** Envelope mínimo del webhook de Messenger (object 'page'). */
interface PageWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; messaging?: unknown[] }>;
}

/**
 * Fase 2 — Handler del webhook de Facebook Messenger (`/api/channels/messenger/:slug`).
 * Espeja a `WhatsAppWebhookHandler` pero para el envelope `object: 'page'`:
 *  - resuelve la org por `webhookSlug` (opaco, org-scoped 4.P),
 *  - matchea el `pageId` (`entry[].id`) contra los Channel MESSENGER de la org,
 *  - valida la firma HMAC (x-hub-signature-256) con el appSecret del canal,
 *  - parsea el payload con `MessengerAdapter.parseInbound` y lo ingiere por el
 *    `ConversationIngestService` (agnóstico) dentro del TenantContext del canal.
 *
 * Siempre 200 si la firma es válida (igual criterio que WhatsApp: 4xx/5xx hace que
 * Meta reintente agresivo).
 */
@Injectable()
export class MessengerWebhookHandler {
  private readonly logger = new Logger(MessengerWebhookHandler.name);

  private readonly slugCache = new Map<string, { orgId: string; expiresAt: number }>();
  private static readonly SLUG_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly adapter: MessengerAdapter,
    private readonly ingest: ConversationIngestService,
  ) {}

  /** GET de verificación de Meta: matchea hub.verify_token contra los Channel
   *  MESSENGER activos de la org dueña del slug. */
  async verify(slug: string, mode: string, token: string, challenge: string): Promise<string> {
    if (mode !== 'subscribe') {
      throw new BadRequestException(`hub.mode=${mode} no soportado`);
    }
    const orgId = await this.resolveOrgIdBySlug(slug);
    const channels = await this.prisma.channel.findMany({
      where: { isActive: true, organizationId: orgId, kind: 'MESSENGER' },
      select: { id: true, webhookVerifyTokenEnc: true },
    });
    for (const c of channels) {
      if (safeStringEqual(token, this.encryption.decrypt(c.webhookVerifyTokenEnc))) {
        this.logger.log(`Webhook Messenger verificado (slug=${slug}, channel=${c.id})`);
        return challenge;
      }
    }
    this.logger.warn(`verify_token no matchea Channel MESSENGER activo para slug=${slug}`);
    throw new ForbiddenException('verify_token inválido');
  }

  /** POST de eventos: valida firma HMAC y delega cada entry al ingest agnóstico. */
  async receive(
    slug: string,
    signature: string | undefined,
    raw: Buffer | undefined,
  ): Promise<{ ok: true }> {
    if (!raw) throw new BadRequestException('rawBody no disponible');

    let payload: PageWebhookPayload;
    try {
      payload = JSON.parse(raw.toString('utf8')) as PageWebhookPayload;
    } catch {
      throw new BadRequestException('payload no es JSON válido');
    }
    if (payload?.object !== 'page') {
      this.logger.debug(`payload object=${payload?.object} ignorado`);
      return { ok: true };
    }

    const pageIds = new Set<string>();
    for (const entry of payload.entry ?? []) {
      if (entry.id) pageIds.add(entry.id);
    }
    if (pageIds.size === 0) {
      this.logger.debug('payload Messenger sin page id, ignorado');
      return { ok: true };
    }

    const orgId = await this.resolveOrgIdBySlug(slug);
    const channels = (await this.prisma.channel.findMany({
      where: { organizationId: orgId, kind: 'MESSENGER', pageId: { in: [...pageIds] } },
      select: {
        id: true, organizationId: true, teamId: true, kind: true,
        accessTokenEnc: true, isTestMode: true, phoneNumberId: true, pageId: true,
        appSecretEnc: true,
        bot: {
          select: {
            enabled: true, flow: true, sessionTtlMin: true,
            topics: true, router: true, variables: true,
          },
        },
      },
    })) as Array<IngestChannel & { pageId: string | null; appSecretEnc: string | null }>;
    if (channels.length === 0) {
      this.logger.warn(`webhook Messenger slug=${slug} sin Channel matching pageIds=${[...pageIds].join(',')}`);
      throw new NotFoundException('canal no encontrado');
    }

    // Firma HMAC con el appSecret (igual que WhatsApp).
    const first = channels[0]!;
    if (first.appSecretEnc) {
      const appSecret = this.encryption.decrypt(first.appSecretEnc);
      if (!signature || !verifySignature(signature, raw, appSecret)) {
        this.logger.warn(`firma Messenger inválida (slug=${slug}, channel=${first.id})`);
        throw new ForbiddenException('signature mismatch');
      }
    } else {
      this.logger.warn(`Channel ${first.id} sin appSecret — webhook Messenger acepta sin verificar firma (NO usar en prod)`);
    }

    // Por cada canal: parsear sólo sus entries (por pageId) e ingerir en su TenantContext.
    for (const channel of channels) {
      const entries = (payload.entry ?? []).filter((e) => e.id === channel.pageId);
      if (entries.length === 0) continue;
      const inbounds = this.adapter.parseInbound({ object: 'page', entry: entries });
      if (inbounds.length === 0) continue;
      const ctx: RequestContext = {
        userId: 'system:messenger-webhook',
        organizationId: channel.organizationId,
        teamId: channel.teamId,
        orgRole: 'OWNER',
        teamRole: 'ADMIN',
      };
      await TenantContext.run(ctx, () => this.ingest.ingest(channel, inbounds));
    }
    return { ok: true };
  }

  private async resolveOrgIdBySlug(slug: string): Promise<string> {
    const now = Date.now();
    const cached = this.slugCache.get(slug);
    if (cached && cached.expiresAt > now) return cached.orgId;
    const org = await this.prisma.organization.findUnique({
      where: { webhookSlug: slug },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('webhook no encontrado');
    this.slugCache.set(slug, { orgId: org.id, expiresAt: now + MessengerWebhookHandler.SLUG_CACHE_TTL_MS });
    return org.id;
  }
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
