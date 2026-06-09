import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EncryptionService } from '../../common/security/encryption.service';
import type { CreateChannelDto, UpdateChannelDto } from './channels.dto';

export interface ChannelListItem {
  id: string;
  name: string | null;
  phoneNumberId: string;
  /** Messenger/Instagram: id de la página (null para WhatsApp). */
  pageId: string | null;
  businessAccountId: string;
  isActive: boolean;
  isTestMode: boolean;
  createdAt: Date;
  /** Phase 0b (multi-canal): bot conectado a este canal (null si ninguno). */
  botId: string | null;
  /** Plataforma agéntica: agente IA conectado (null si ninguno). Excluyente con botId. */
  agentId: string | null;
  /** Fase 1 (multi-canal): tipo de canal (WHATSAPP/INSTAGRAM/…). */
  kind: string;
}

export interface ChannelDetail extends ChannelListItem {
  welcomeMessage: string | null;
  optOutConfirmMessage: string | null;
  optOutKeywords: string[];
  dailyLimit: number;
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
  updatedAt: Date;
}

/** 4.Q — valida min ≤ max del throttle. Considera defaults persistidos para edits parciales. */
function assertDelayRange(min: number | undefined, max: number | undefined, current?: { sendDelayMinMs: number; sendDelayMaxMs: number }): void {
  const effectiveMin = min ?? current?.sendDelayMinMs;
  const effectiveMax = max ?? current?.sendDelayMaxMs;
  if (effectiveMin === undefined || effectiveMax === undefined) return;
  if (effectiveMin > effectiveMax) {
    throw new BadRequestException('sendDelayMinMs debe ser ≤ sendDelayMaxMs');
  }
}

function normalizeKeywords(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const k = raw.trim().toUpperCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function toListItem(row: any): ChannelListItem {
  return {
    id: row.id,
    name: row.name,
    phoneNumberId: row.phoneNumberId ?? '',
    pageId: row.pageId ?? null,
    businessAccountId: row.businessAccountId,
    isActive: row.isActive,
    isTestMode: row.isTestMode ?? false,
    createdAt: row.createdAt,
    botId: row.botId ?? null,
    agentId: row.agentId ?? null,
    kind: row.kind ?? 'WHATSAPP',
  };
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para consultar WapiConfigs');
    }
    return ctx;
  }

  async findAll(kind?: string): Promise<ChannelListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.channel.findMany({
      // Filtro opcional por tipo de canal: features WhatsApp-específicas
      // (campañas, templates) piden `kind=WHATSAPP` para no listar otros canales.
      ...(kind ? { where: { kind } as never } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toListItem);
  }

  async findOne(id: string): Promise<ChannelDetail> {
    this.requireContext();
    const row = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }
    return {
      id: row.id,
      name: row.name,
      phoneNumberId: row.phoneNumberId ?? '',
      pageId: row.pageId ?? null,
      businessAccountId: row.businessAccountId,
      isActive: row.isActive,
      isTestMode: row.isTestMode ?? false,
      botId: row.botId ?? null,
      agentId: row.agentId ?? null,
      kind: row.kind ?? 'WHATSAPP',
      welcomeMessage: row.welcomeMessage,
      optOutConfirmMessage: row.optOutConfirmMessage,
      optOutKeywords: row.optOutKeywords ?? [],
      dailyLimit: row.dailyLimit,
      sendDelayMinMs: row.sendDelayMinMs,
      sendDelayMaxMs: row.sendDelayMaxMs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(dto: CreateChannelDto): Promise<ChannelListItem> {
    const ctx = this.requireContext();
    assertDelayRange(dto.sendDelayMinMs, dto.sendDelayMaxMs);

    // Fase 2-4 — alta kind-aware. WhatsApp se identifica por phoneNumberId+WABA;
    // Messenger/Instagram por pageId (page id / IG account id); Webchat por una
    // "widget key" auto-generada (guardada en pageId). businessAccountId es
    // WhatsApp-only (no-WA → '').
    const kind = (dto.kind ?? 'WHATSAPP') as 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM' | 'WEBCHAT';
    let identity: { phoneNumberId: string | null; pageId: string | null; businessAccountId: string };
    if (kind === 'WHATSAPP') {
      if (!dto.phoneNumberId || !dto.businessAccountId) {
        throw new BadRequestException('WhatsApp requiere phoneNumberId y businessAccountId');
      }
      identity = { phoneNumberId: dto.phoneNumberId, pageId: null, businessAccountId: dto.businessAccountId };
    } else if (kind === 'WEBCHAT') {
      // Webchat no tiene proveedor externo: generamos una clave pública para el widget.
      identity = { phoneNumberId: null, pageId: `wc_${randomBytes(12).toString('hex')}`, businessAccountId: '' };
    } else {
      if (!dto.pageId) {
        throw new BadRequestException(`${kind === 'INSTAGRAM' ? 'Instagram' : 'Messenger'} requiere pageId`);
      }
      identity = { phoneNumberId: null, pageId: dto.pageId, businessAccountId: '' };
    }

    // Credenciales Meta: obligatorias salvo Webchat (que entrega por socket).
    if (kind !== 'WEBCHAT' && (!dto.accessToken || !dto.webhookVerifyToken)) {
      throw new BadRequestException('accessToken y webhookVerifyToken son obligatorios');
    }

    const row = await this.prisma.scoped.channel.create({
      data: {
        name: dto.name,
        kind,
        phoneNumberId: identity.phoneNumberId,
        pageId: identity.pageId,
        businessAccountId: identity.businessAccountId,
        accessTokenEnc: this.encryption.encrypt(dto.accessToken ?? ''),
        webhookVerifyTokenEnc: this.encryption.encrypt(dto.webhookVerifyToken ?? ''),
        appSecretEnc: dto.appSecret ? this.encryption.encrypt(dto.appSecret) : dto.appSecret,
        welcomeMessage: dto.welcomeMessage,
        optOutConfirmMessage: dto.optOutConfirmMessage,
        optOutKeywords: normalizeKeywords(dto.optOutKeywords),
        dailyLimit: dto.dailyLimit,
        sendDelayMinMs: dto.sendDelayMinMs,
        sendDelayMaxMs: dto.sendDelayMaxMs,
        isTestMode: dto.isTestMode ?? false,
      } as Prisma.ChannelUncheckedCreateInput,
    });
    this.logger.log(`Channel created: ${row.id} kind=${kind} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return toListItem(row);
  }

  async update(id: string, dto: UpdateChannelDto): Promise<ChannelListItem> {
    this.requireContext();
    const current = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    assertDelayRange(dto.sendDelayMinMs, dto.sendDelayMaxMs, {
      sendDelayMinMs: current.sendDelayMinMs,
      sendDelayMaxMs: current.sendDelayMaxMs,
    });

    const updateData: any = {
      name: dto.name,
      phoneNumberId: dto.phoneNumberId,
      pageId: dto.pageId,
      businessAccountId: dto.businessAccountId,
      welcomeMessage: dto.welcomeMessage,
      optOutConfirmMessage: dto.optOutConfirmMessage,
      dailyLimit: dto.dailyLimit,
      sendDelayMinMs: dto.sendDelayMinMs,
      sendDelayMaxMs: dto.sendDelayMaxMs,
      isActive: dto.isActive,
      isTestMode: dto.isTestMode,
    };
    if (dto.optOutKeywords !== undefined) {
      updateData.optOutKeywords = normalizeKeywords(dto.optOutKeywords);
    }

    if (dto.accessToken !== undefined) updateData.accessTokenEnc = this.encryption.encrypt(dto.accessToken);
    if (dto.webhookVerifyToken !== undefined) updateData.webhookVerifyTokenEnc = this.encryption.encrypt(dto.webhookVerifyToken);
    if (dto.appSecret !== undefined) {
      updateData.appSecretEnc = dto.appSecret === null ? null : this.encryption.encrypt(dto.appSecret);
    }

    const row = await this.prisma.scoped.channel.update({
      where: { id },
      data: updateData,
    });
    return toListItem(row);
  }

  /**
   * 4.P — devuelve los secretos en claro para que el usuario los pegue en Meta
   * (verifyToken al setear el webhook). Restringido por policy a OWNER/ADMIN
   * de la org. Logueamos cada acceso para auditoría.
   */
  async revealSecrets(id: string): Promise<{ webhookVerifyToken: string }> {
    const ctx = this.requireContext();
    const row = await this.prisma.scoped.channel.findFirst({
      where: { id },
      select: { id: true, webhookVerifyTokenEnc: true },
    });
    if (!row) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }
    this.logger.warn(
      `WapiConfig.revealSecrets: org=${ctx.organizationId} user=${ctx.userId} config=${id}`,
    );
    return {
      webhookVerifyToken: this.encryption.decrypt(row.webhookVerifyTokenEnc),
    };
  }

  /**
   * Asigna la automatización de un canal de forma **excluyente**: un canal atiende
   * con un Bot (flujo determinista) **o** con un Agente IA, nunca ambos. Centraliza
   * lo que antes se seteaba en dos lugares (bot desde Canales, agente desde Agentes)
   * y evita el bug de precedencia (con ambos puestos contestaba siempre el agente).
   */
  async assignAutomation(
    id: string,
    type: 'none' | 'bot' | 'agent',
    refId: string | null,
  ): Promise<ChannelListItem> {
    this.requireContext();
    const channel = await this.prisma.scoped.channel.findFirst({ where: { id }, select: { id: true } });
    if (!channel) throw new NotFoundException(`Canal ${id} no encontrado en este scope`);

    let data: { botId: string | null; agentId: string | null };
    if (type === 'bot') {
      if (!refId) throw new BadRequestException('Falta el id del bot');
      const bot = await this.prisma.scoped.bot.findFirst({ where: { id: refId }, select: { id: true } });
      if (!bot) throw new NotFoundException(`Bot ${refId} no encontrado en este scope`);
      data = { botId: refId, agentId: null };
    } else if (type === 'agent') {
      if (!refId) throw new BadRequestException('Falta el id del agente');
      const agent = await this.prisma.scoped.agent.findFirst({ where: { id: refId }, select: { id: true } });
      if (!agent) throw new NotFoundException(`Agente ${refId} no encontrado en este scope`);
      data = { botId: null, agentId: refId };
    } else {
      data = { botId: null, agentId: null };
    }

    const row = await this.prisma.scoped.channel.update({ where: { id }, data: data as never });
    this.logger.log(`Channel ${id} automation → ${type}${refId ? `:${refId}` : ''}`);
    return toListItem(row);
  }

  async remove(id: string): Promise<void> {
    this.requireContext();
    const current = await this.prisma.scoped.channel.findFirst({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException(`WapiConfig ${id} no encontrado en este scope`);
    }

    await this.prisma.scoped.channel.delete({
      where: { id },
    });
    this.logger.log(`WapiConfig deleted: ${id}`);
  }
}
