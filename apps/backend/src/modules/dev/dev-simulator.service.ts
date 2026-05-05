import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  WapiWebhookService,
  type InboundMediaOverride,
  type ResolvedWebhookConfig,
} from '../wapi/webhook/wapi-webhook.service';
import type {
  WapiWebhookMessage,
  WapiWebhookPayload,
  WapiWebhookStatus,
} from '../wapi/webhook/wapi-webhook.types';
import { WapiMediaService } from '../wapi/media/wapi-media.service';
import {
  ALLOWED_MIMES_BY_TYPE,
  MEDIA_LIMITS_BY_TYPE,
  type WapiMediaType,
} from '../wapi/media/wapi-media.types';
import type {
  SimulateInboundMediaDto,
  SimulateInboundReactionDto,
  SimulateInboundTextDto,
  SimulateMediaType,
  SimulateStatusDto,
} from './dev-simulator.dto';

interface SimulateMediaUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface ResolvedSimConfig {
  configId: string;
  organizationId: string;
  teamId: string;
  phoneNumberId: string;
  businessAccountId: string;
}

/**
 * Inyecta payloads Meta-shaped directamente en `WapiWebhookService.process(...)`,
 * saltando HMAC y la URL pública del webhook. Sólo activo si
 * `ENABLE_DEV_SIMULATOR=true`.
 *
 * Para media inbound: persistimos el buffer localmente con `WapiMediaService`
 * y pasamos el `mediaOverrides` map para que el webhook handler use ese binario
 * en vez de pegarle a Meta Graph (no existe `mediaId` real).
 */
@Injectable()
export class DevSimulatorService {
  private readonly logger = new Logger(DevSimulatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhook: WapiWebhookService,
    private readonly media: WapiMediaService,
  ) {}

  async simulateInboundText(dto: SimulateInboundTextDto): Promise<{ ok: true; metaMessageId: string }> {
    const cfg = await this.resolveConfig(dto.configId);
    const metaMessageId = this.fakeWamid();
    const message: WapiWebhookMessage = {
      id: metaMessageId,
      from: dto.fromPhone,
      timestamp: this.nowSec(),
      type: 'text',
      text: { body: dto.body },
    };
    await this.deliver(cfg, dto.fromPhone, dto.fromName, [message]);
    return { ok: true, metaMessageId };
  }

  async simulateInboundMedia(
    dto: SimulateInboundMediaDto,
    file: SimulateMediaUpload,
  ): Promise<{ ok: true; metaMessageId: string; mediaId: string }> {
    const cfg = await this.resolveConfig(dto.configId);
    this.validateMediaUpload(dto.type, file.mimetype, file.size);

    const persisted = await this.media.persistInboundLocal(cfg.configId, file.buffer, file.mimetype);

    const mediaId = `sim-${randomBytes(8).toString('hex')}`;
    const metaMessageId = this.fakeWamid();

    const message: WapiWebhookMessage = {
      id: metaMessageId,
      from: dto.fromPhone,
      timestamp: this.nowSec(),
      type: dto.type,
    };
    const sub: { id: string; mime_type: string; sha256: string; caption?: string; filename?: string } = {
      id: mediaId,
      mime_type: file.mimetype,
      sha256: persisted.sha256,
    };
    if (dto.caption && dto.type !== 'audio' && dto.type !== 'sticker') {
      sub.caption = dto.caption;
    }
    if (dto.type === 'document') {
      sub.filename = file.originalname || 'documento';
    }
    switch (dto.type) {
      case 'image':
        message.image = sub;
        break;
      case 'audio':
        message.audio = { id: sub.id, mime_type: sub.mime_type, sha256: sub.sha256 };
        break;
      case 'video':
        message.video = sub;
        break;
      case 'document':
        message.document = {
          id: sub.id,
          mime_type: sub.mime_type,
          filename: sub.filename ?? 'documento',
          caption: sub.caption,
        };
        break;
      case 'sticker':
        message.sticker = { id: sub.id, mime_type: sub.mime_type, sha256: sub.sha256 };
        break;
    }

    const overrides = new Map<string, InboundMediaOverride>([
      [
        mediaId,
        {
          sha256: persisted.sha256,
          size: persisted.size,
          localPath: persisted.localPath,
          mime: persisted.mime,
        },
      ],
    ]);

    await this.deliver(cfg, dto.fromPhone, dto.fromName, [message], overrides);
    return { ok: true, metaMessageId, mediaId };
  }

  async simulateInboundReaction(
    dto: SimulateInboundReactionDto,
  ): Promise<{ ok: true; metaMessageId: string }> {
    const cfg = await this.resolveConfig(dto.configId);
    const metaMessageId = this.fakeWamid();
    const message: WapiWebhookMessage = {
      id: metaMessageId,
      from: dto.fromPhone,
      timestamp: this.nowSec(),
      type: 'reaction',
      reaction: { message_id: dto.targetMetaMessageId, emoji: dto.emoji },
    };
    await this.deliver(cfg, dto.fromPhone, dto.fromName, [message]);
    return { ok: true, metaMessageId };
  }

  async simulateStatus(dto: SimulateStatusDto): Promise<{ ok: true }> {
    const cfg = await this.resolveConfig(dto.configId);
    const status: WapiWebhookStatus = {
      id: dto.metaMessageId,
      recipient_id: dto.recipientPhone,
      status: dto.status,
      timestamp: this.nowSec(),
    };
    if (dto.status === 'failed') {
      status.errors = [
        { code: 0, title: 'Simulated failure', message: 'Inyectado por DevSimulator' },
      ];
    }

    const payload: WapiWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: cfg.businessAccountId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: cfg.phoneNumberId,
                  display_phone_number: cfg.phoneNumberId,
                },
                statuses: [status],
              },
            },
          ],
        },
      ],
    };

    await this.webhook.process(payload, this.singleConfigMap(cfg));
    return { ok: true };
  }

  private async deliver(
    cfg: ResolvedSimConfig,
    fromPhone: string,
    fromName: string | undefined,
    messages: WapiWebhookMessage[],
    overrides?: Map<string, InboundMediaOverride>,
  ): Promise<void> {
    const payload: WapiWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: cfg.businessAccountId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: cfg.phoneNumberId,
                  display_phone_number: cfg.phoneNumberId,
                },
                contacts: [{ wa_id: fromPhone, profile: fromName ? { name: fromName } : undefined }],
                messages,
              },
            },
          ],
        },
      ],
    };
    this.logger.debug(
      `simulate inbound configId=${cfg.configId} from=${fromPhone} types=${messages.map((m) => m.type).join(',')}`,
    );
    await this.webhook.process(payload, this.singleConfigMap(cfg), overrides);
  }

  private singleConfigMap(cfg: ResolvedSimConfig): Map<string, ResolvedWebhookConfig> {
    return new Map([
      [
        cfg.phoneNumberId,
        {
          configId: cfg.configId,
          organizationId: cfg.organizationId,
          teamId: cfg.teamId,
        },
      ],
    ]);
  }

  private async resolveConfig(configId: string): Promise<ResolvedSimConfig> {
    const cfg = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        organizationId: true,
        teamId: true,
        phoneNumberId: true,
        businessAccountId: true,
        isActive: true,
      },
    });
    if (!cfg) throw new NotFoundException(`WapiConfig ${configId} no encontrado`);
    if (!cfg.isActive) throw new BadRequestException('WapiConfig deshabilitada');
    return {
      configId: cfg.id,
      organizationId: cfg.organizationId,
      teamId: cfg.teamId,
      phoneNumberId: cfg.phoneNumberId,
      businessAccountId: cfg.businessAccountId,
    };
  }

  private validateMediaUpload(type: SimulateMediaType, mime: string, size: number): void {
    const allowed = ALLOWED_MIMES_BY_TYPE[type as WapiMediaType];
    if (!allowed.has(mime)) {
      throw new BadRequestException(
        `Mime "${mime}" no permitido para type=${type}. Permitidos: ${[...allowed].join(', ')}`,
      );
    }
    const limit = MEDIA_LIMITS_BY_TYPE[type as WapiMediaType];
    if (size > limit) {
      throw new BadRequestException(
        `Archivo de ${size} bytes excede el límite de ${limit} bytes para type=${type}`,
      );
    }
  }

  private fakeWamid(): string {
    return `wamid.SIM_${randomBytes(12).toString('hex').toUpperCase()}`;
  }

  private nowSec(): string {
    return Math.floor(Date.now() / 1000).toString();
  }
}
