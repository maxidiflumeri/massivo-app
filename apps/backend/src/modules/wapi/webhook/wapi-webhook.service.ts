import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EventLogger } from '../../../common/observability/event-logger.service';
import { ObservabilityContext } from '../../../common/observability/observability-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiMediaService } from '../media/wapi-media.service';
import { WapiMediaException } from '../media/wapi-media.types';
import { WapiButtonActionService } from '../button-actions/wapi-button-action.service';
import { WapiBotEngineService } from '../bot/wapi-bot-engine.service';
import { WapiBotFeatureService } from '../bot/wapi-bot-feature.service';
import { WapiBotRouterService } from '../bot/wapi-bot-router.service';
import { WapiOptOutService } from '../opt-out/wapi-opt-out.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import { WapiSendException } from '../sender/wapi-sender.types';
import type {
  WapiWebhookMessage,
  WapiWebhookPayload,
  WapiWebhookStatus,
  WapiWebhookValue,
} from './wapi-webhook.types';

const MEDIA_TYPES_WITH_BINARY = new Set(['image', 'audio', 'video', 'document', 'sticker']);

interface InboundMediaInfo {
  mediaId: string;
  mime?: string;
  sha256FromMeta?: string;
  caption?: string;
  filename?: string;
}

interface ExtractedButtonInfo {
  buttonId: string;
  buttonText: string | null;
  contextMetaMessageId: string | null;
  shape: 'interactive' | 'button';
}

/**
 * Resolución de config por phone_number_id. El controller carga los configs en
 * un solo query y arma el map para que el service no vuelva a tocar la DB para
 * resolver tenant.
 */
export interface ResolvedWebhookConfig {
  configId: string;
  organizationId: string;
  teamId: string;
}

/**
 * Override de descarga de media usado por el Dev Simulator (4.L). Cuando
 * `process(...)` recibe un map keyed por `mediaId`, el handler skipea la
 * llamada a Meta y usa estos datos directos. El binario debe haber sido
 * persistido localmente antes (via `WapiMediaService.persistInboundLocal`).
 */
export interface InboundMediaOverride {
  sha256: string;
  size: number;
  localPath: string;
  mime: string;
}

/**
 * Procesa eventos del webhook Meta. El controller ya validó firma y resolvió
 * los configs por `phone_number_id` — acá entramos directo al payload.
 *
 * Dos flujos paralelos por cada `entry[].changes[].value`:
 *  - `statuses[]`: actualiza WapiReport por `metaMessageId`. Map sent →
 *    (mantiene SENT), delivered → DELIVERED + deliveredAt, read → READ +
 *    readAt, failed → FAILED + failedAt + error. Idempotente: si ya está en
 *    un estado posterior (e.g. READ y llega delivered), no retrocede.
 *  - `messages[]`: mensaje entrante del usuario. Upsert
 *    `WapiConversation(teamId, configId, phone)` y crea `WapiMessage` con
 *    `metaMessageId` único. Renueva `lastMessageAt` y la ventana 24h.
 *
 * Multi-config: un mismo POST puede traer eventos de varios `phone_number_id`
 * (Meta batchea por App). Cada `value` se resuelve a su config correspondiente
 * y se procesa en su propio `TenantContext.run` para que el scoping de Prisma
 * sea correcto por entry.
 *
 * Idempotencia: las creaciones de `WapiMessage` van bajo `metaMessageId @unique`,
 * así que duplicados de Meta tiran P2002 silenciosamente.
 */
@Injectable()
export class WapiWebhookService {
  private readonly logger = new Logger(WapiWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly media: WapiMediaService,
    private readonly sender: WapiSenderService,
    private readonly encryption: EncryptionService,
    private readonly optOut: WapiOptOutService,
    private readonly buttonActions: WapiButtonActionService,
    private readonly botEngine: WapiBotEngineService,
    private readonly botFeature: WapiBotFeatureService,
    private readonly botRouter: WapiBotRouterService,
    private readonly eventLogger: EventLogger,
  ) {}

  async process(
    payload: WapiWebhookPayload,
    configByPhoneNumberId: Map<string, ResolvedWebhookConfig>,
    mediaOverrides?: Map<string, InboundMediaOverride>,
  ): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const cfg = configByPhoneNumberId.get(phoneNumberId);
        if (!cfg) {
          this.logger.warn(
            `entry con phone_number_id=${phoneNumberId} sin config resuelto — skip`,
          );
          continue;
        }
        const ctx: RequestContext = {
          userId: 'system:wapi-webhook',
          organizationId: cfg.organizationId,
          teamId: cfg.teamId,
          orgRole: 'OWNER',
          teamRole: 'ADMIN',
        };
        await TenantContext.run(ctx, () => this.processValue(change.value, cfg, mediaOverrides));
      }
    }
  }

  private async processValue(
    value: WapiWebhookValue,
    tenant: ResolvedWebhookConfig,
    mediaOverrides?: Map<string, InboundMediaOverride>,
  ): Promise<void> {
    if (Array.isArray(value.statuses)) {
      for (const st of value.statuses) {
        await this.handleStatus(st, tenant);
      }
    }
    if (Array.isArray(value.messages)) {
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const msg of value.messages) {
        await this.handleInboundMessage(msg, contactName, tenant, mediaOverrides);
      }
    }
  }

  private async handleStatus(st: WapiWebhookStatus, tenant: ResolvedWebhookConfig): Promise<void> {
    const report = await this.prisma.scoped.wapiReport.findFirst({
      where: { metaMessageId: st.id },
      select: { id: true, campaignId: true, status: true },
    });
    if (!report) {
      this.logger.warn(`status ${st.status} para metaMessageId=${st.id} sin WapiReport (team ${tenant.teamId})`);
      return;
    }

    const data: Record<string, unknown> = {};
    const tsMs = Number(st.timestamp) * 1000;
    const ts = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();

    switch (st.status) {
      case 'sent':
        // Ya marcamos SENT al recibir el ack del POST /messages — este status
        // es redundante pero confirma. No tocamos timestamps ni el status.
        return;
      case 'delivered':
        if (report.status === 'READ' || report.status === 'FAILED') return;
        data.status = 'DELIVERED';
        data.deliveredAt = ts;
        break;
      case 'read':
        if (report.status === 'FAILED') return;
        data.status = 'READ';
        data.readAt = ts;
        if (report.status !== 'DELIVERED') data.deliveredAt = ts;
        break;
      case 'failed': {
        const err = st.errors?.[0];
        const errMsg = err
          ? `${err.code}:${err.title}${err.message ? ` — ${err.message}` : ''}`
          : 'unknown failure';
        data.status = 'FAILED';
        data.failedAt = ts;
        data.error = errMsg.slice(0, 500);
        break;
      }
      default:
        this.logger.warn(`status desconocido: ${String(st.status)}`);
        return;
    }

    if (Object.keys(data).length === 0) return;
    await this.prisma.scoped.wapiReport.update({
      where: { id: report.id },
      data,
    });
    this.events.emitToTeamDebounced(
      tenant.teamId,
      'wapi.report.updated',
      report.campaignId,
      { campaignId: report.campaignId },
    );
  }

  private async handleInboundMessage(
    msg: WapiWebhookMessage,
    profileName: string | null,
    tenant: ResolvedWebhookConfig,
    mediaOverrides?: Map<string, InboundMediaOverride>,
  ): Promise<void> {
    const phone = msg.from;
    const tsMs = Number(msg.timestamp) * 1000;
    const ts = Number.isFinite(tsMs) ? new Date(tsMs) : new Date();

    // 4.R — enriquecer el ObservabilityContext con phone/configId apenas los
    // conocemos. Todo lo que se logue downstream (bot engine, http executor,
    // sender) hereda estos IDs sin que haya que pasarlos manualmente.
    ObservabilityContext.augment({ phone, configId: tenant.configId });
    this.eventLogger.wapiInbound({
      phone,
      configId: tenant.configId,
      type: msg.type,
      body: inboundBodyPreview(msg),
      metaMessageId: msg.id,
    });

    // findFirst + create/update en vez de upsert para detectar primera
    // conversación (necesario para 4.I welcome message). El race entre dos
    // webhooks del mismo phone+config en simultáneo es muy raro y, si ocurre,
    // el unique (teamId, configId, phone) tira P2002 — capturamos abajo.
    const existing = await this.prisma.scoped.wapiConversation.findFirst({
      where: { configId: tenant.configId, phone },
      select: { id: true, status: true, assignedUserId: true, unreadCount: true },
    });
    const isNewConversation = !existing;
    let conversation: { id: string; status: string; assignedUserId: string | null; unreadCount: number };
    if (existing) {
      // 4.O.6 — NO auto-reopen de RESOLVED. El bot debe atender al cliente y
      // sólo si llega a HANDOFF (o el template button INBOX) la conversación
      // vuelve al inbox. Mantener status hace que la conversación quede oculta
      // del inbox (por escalated=false) hasta que el bot decida escalar.
      // En cambio, WAITING → UNASSIGNED (el cliente respondió, sale de espera).
      const waitingTransition =
        existing.status === 'WAITING'
          ? { status: 'UNASSIGNED', waitingUntil: null }
          : {};
      conversation = await this.prisma.scoped.wapiConversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: ts,
          window24hAt: new Date(ts.getTime() + 24 * 60 * 60_000),
          unreadCount: { increment: 1 },
          ...(profileName ? { name: profileName } : {}),
          ...waitingTransition,
        } as never,
        select: { id: true, status: true, assignedUserId: true, unreadCount: true },
      });
    } else {
      try {
        conversation = await this.prisma.scoped.wapiConversation.create({
          data: {
            organizationId: tenant.organizationId,
            teamId: tenant.teamId,
            configId: tenant.configId,
            phone,
            name: profileName,
            lastMessageAt: ts,
            window24hAt: new Date(ts.getTime() + 24 * 60 * 60_000),
            unreadCount: 1,
          },
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
      } catch (err) {
        // Race contra otro webhook simultáneo — refetch y treat as existing.
        const code = (err as { code?: string }).code;
        if (code !== 'P2002') throw err;
        const refetched = await this.prisma.scoped.wapiConversation.findFirst({
          where: { configId: tenant.configId, phone },
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
        if (!refetched) throw err;
        conversation = refetched;
      }
    }

    // 4.R — ya tenemos la conv; agregar al scope para los logs downstream
    ObservabilityContext.augment({ conversationId: conversation.id });

    // Si el mensaje trae media (image/audio/video/document/sticker), descargamos
    // el binario de Meta y lo cacheamos local. Las URLs de Meta expiran en ~5min;
    // sin caché, abrir el thread más tarde rompe. Reacciones no traen binario.
    const mediaInfo = extractMediaInfo(msg);
    let mediaPersisted: {
      mediaId: string;
      mediaMime: string | null;
      mediaSha256: string | null;
      mediaSize: number | null;
      mediaFilename: string | null;
      mediaCaption: string | null;
      mediaLocalPath: string | null;
    } | null = null;
    if (mediaInfo && MEDIA_TYPES_WITH_BINARY.has(msg.type)) {
      const override = mediaOverrides?.get(mediaInfo.mediaId);
      if (override) {
        mediaPersisted = {
          mediaId: mediaInfo.mediaId,
          mediaMime: override.mime,
          mediaSha256: override.sha256,
          mediaSize: override.size,
          mediaFilename: mediaInfo.filename ?? null,
          mediaCaption: mediaInfo.caption ?? null,
          mediaLocalPath: override.localPath,
        };
      } else try {
        const dl = await this.media.fetchInboundMedia(tenant.configId, mediaInfo.mediaId);
        mediaPersisted = {
          mediaId: mediaInfo.mediaId,
          mediaMime: dl.mime,
          mediaSha256: dl.sha256,
          mediaSize: dl.size,
          mediaFilename: mediaInfo.filename ?? null,
          mediaCaption: mediaInfo.caption ?? null,
          mediaLocalPath: dl.localPath,
        };
      } catch (err) {
        // No bloqueamos la persistencia del mensaje si falla la descarga: el
        // operador igual ve la entrada en el thread (con caption si vino) y
        // puede reintentar. Loggeamos y seguimos.
        const code = err instanceof WapiMediaException ? err.code : 'unknown';
        this.logger.warn(
          `Media download falló para metaMessageId=${msg.id} mediaId=${mediaInfo.mediaId} code=${code}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        mediaPersisted = {
          mediaId: mediaInfo.mediaId,
          mediaMime: mediaInfo.mime ?? null,
          mediaSha256: null,
          mediaSize: null,
          mediaFilename: mediaInfo.filename ?? null,
          mediaCaption: mediaInfo.caption ?? null,
          mediaLocalPath: null,
        };
      }
    }

    let createdMessageId: string | null = null;
    let storedContent: unknown = null;
    try {
      const created = await this.prisma.scoped.wapiMessage.create({
        data: {
          organizationId: tenant.organizationId,
          teamId: tenant.teamId,
          conversationId: conversation.id,
          metaMessageId: msg.id,
          fromMe: false,
          type: msg.type,
          content: extractContent(msg) as Prisma.InputJsonValue,
          status: 'received',
          timestamp: ts,
          ...(mediaPersisted ?? {}),
        },
        select: { id: true, content: true },
      });
      createdMessageId = created.id;
      storedContent = created.content;
    } catch (err) {
      // Duplicado por unique(metaMessageId) — Meta a veces re-envía. Log y seguir.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        this.logger.debug(`WapiMessage duplicado metaMessageId=${msg.id} — ignorado`);
        return;
      }
      throw err;
    }

    // Evento legacy (3.E inbound).
    this.events.emitToTeam(tenant.teamId, 'wapi.message.inbound', {
      conversationId: conversation.id,
      configId: tenant.configId,
      phone,
      type: msg.type,
      ts: ts.toISOString(),
    });

    // Eventos del inbox (4.F.3): el frontend usa estos para append a la lista
    // y a la conversación abierta sin necesidad de re-fetchear.
    this.events.emitToTeam(tenant.teamId, 'wapi.message.new', {
      conversationId: conversation.id,
      configId: tenant.configId,
      phone,
      message: {
        id: createdMessageId,
        fromMe: false,
        type: msg.type,
        content: storedContent,
        status: 'received',
        timestamp: ts.toISOString(),
        metaMessageId: msg.id,
        ...(mediaPersisted
          ? {
              mediaMime: mediaPersisted.mediaMime,
              mediaSize: mediaPersisted.mediaSize,
              mediaFilename: mediaPersisted.mediaFilename,
              mediaCaption: mediaPersisted.mediaCaption,
            }
          : {}),
      },
    });
    this.events.emitToTeam(tenant.teamId, 'wapi.conversation.updated', {
      id: conversation.id,
      configId: tenant.configId,
      phone,
      status: conversation.status,
      assignedUserId: conversation.assignedUserId,
      lastMessageAt: ts.toISOString(),
      unreadCount: conversation.unreadCount,
    });

    // Auto-respuestas (4.H opt-out + 4.I welcome + 4.K button actions + 4.M bot).
    // Cargamos el config completo sólo si alguno de los disparadores aplica,
    // para no pegar a DB en cada inbound. Orden de aplicación:
    //  0. Bot guiado (4.M): intercepta texto e button replies con prefijo `bot:`
    //     antes que el resto. Si el bot tomó cargo, no disparamos welcome/optout/4.K.
    //  1. Welcome (sólo primera conversación, y sólo si el bot no la manejó).
    //  2. Opt-out por keyword (cierra ciclo, prevalece sobre handoff humano).
    //  3. Button action (INBOX/BAJA/IGNORAR de templates interactive de campañas).
    const inboundText = msg.type === 'text' ? msg.text?.body ?? null : null;
    const couldTriggerOptOut = inboundText !== null;
    const buttonInfo = extractButtonInfo(msg);
    const isBotButton = buttonInfo ? this.botEngine.isBotButtonId(buttonInfo.buttonId) : false;
    if (isNewConversation || couldTriggerOptOut || buttonInfo) {
      await this.tryAutoReplies({
        configId: tenant.configId,
        conversationId: conversation.id,
        phone,
        isNewConversation,
        inboundText,
        teamId: tenant.teamId,
        buttonInfo,
        isBotButton,
      });
    }
  }

  /**
   * Carga config completo + dispara welcome y/o opt-out según corresponda.
   * Cada auto-reply se loggea pero no rompe el flujo si falla — el inbound
   * ya está persistido y el operador puede responder manual.
   */
  private async tryAutoReplies(input: {
    configId: string;
    conversationId: string;
    phone: string;
    isNewConversation: boolean;
    inboundText: string | null;
    teamId: string;
    buttonInfo: ExtractedButtonInfo | null;
    isBotButton: boolean;
  }): Promise<void> {
    const cfg = (await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: input.configId },
      select: {
        id: true,
        phoneNumberId: true,
        accessTokenEnc: true,
        isActive: true,
        isTestMode: true,
        welcomeMessage: true,
        optOutConfirmMessage: true,
        optOutKeywords: true,
        botEnabled: true,
        botFlow: true,
        botSessionTtlMin: true,
        botTopics: true,
        botRouter: true,
        botVariables: true,
      } as never,
    })) as
      | (Awaited<ReturnType<typeof this.prisma.scoped.wapiConfig.findFirst>> & {
          botEnabled: boolean;
          botFlow: unknown;
          botSessionTtlMin: number;
          botTopics: unknown;
          botRouter: unknown;
          botVariables: unknown;
        })
      | null;
    if (!cfg || !cfg.isActive) return;

    // 0. Bot guiado (4.M). Si está activo y maneja el inbound, omitimos welcome/optout/4.K.
    let botHandled = false;
    // 4.O.1 — gate AND con feature flag (env + per-org). El motor también
    // chequea internamente, pero acortamos antes de armar el inbound.
    const botFeatureOn = await this.botFeature.isEnabled();
    if (
      botFeatureOn &&
      cfg.botEnabled &&
      (cfg.botTopics || cfg.botFlow) &&
      (input.inboundText !== null || input.isBotButton)
    ) {
      const botInbound = input.isBotButton && input.buttonInfo
        ? {
            kind: 'button' as const,
            buttonId: input.buttonInfo.buttonId,
            contextMetaMessageId: input.buttonInfo.contextMetaMessageId,
          }
        : input.inboundText !== null
          ? { kind: 'text' as const, body: input.inboundText }
          : null;
      if (botInbound) {
        const result = await this.botEngine.handle(
          {
            id: cfg.id,
            phoneNumberId: cfg.phoneNumberId,
            accessTokenEnc: cfg.accessTokenEnc,
            isTestMode: cfg.isTestMode,
            botEnabled: cfg.botEnabled,
            botFlow: cfg.botFlow,
            botSessionTtlMin: cfg.botSessionTtlMin,
            botTopics: cfg.botTopics,
            botRouter: cfg.botRouter,
            botVariables: (cfg as unknown as { botVariables?: unknown }).botVariables,
          },
          {
            configId: cfg.id,
            conversationId: input.conversationId,
            phone: input.phone,
            inbound: botInbound,
          },
        );
        botHandled = result.handled;
        // Si el bot terminó con HANDOFF + escalate → marcamos priority como 4.K.
        if (result.ended && result.escalate) {
          try {
            const updated = await this.prisma.scoped.wapiConversation.update({
              where: { id: input.conversationId },
              data: { priority: true } as never,
              select: {
                id: true,
                status: true,
                assignedUserId: true,
                lastMessageAt: true,
                unreadCount: true,
                priority: true,
              } as never,
            });
            const u = updated as unknown as {
              id: string;
              status: string;
              assignedUserId: string | null;
              lastMessageAt: Date | null;
              unreadCount: number;
              priority: boolean;
            };
            this.events.emitToTeam(input.teamId, 'wapi.conversation.updated', {
              id: u.id,
              configId: cfg.id,
              phone: input.phone,
              status: u.status,
              assignedUserId: u.assignedUserId,
              lastMessageAt: u.lastMessageAt?.toISOString() ?? null,
              unreadCount: u.unreadCount,
              priority: u.priority,
            });
          } catch (err) {
            this.logger.warn(`Bot HANDOFF escalate falló: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    if (botHandled) return;

    if (input.isNewConversation && cfg.welcomeMessage && cfg.welcomeMessage.trim()) {
      await this.sendAutoReply({
        cfg,
        conversationId: input.conversationId,
        phone: input.phone,
        body: cfg.welcomeMessage,
        kind: 'welcome',
      });
    }

    if (input.inboundText) {
      const keywords = this.optOut.resolveKeywords(cfg.optOutKeywords);
      const matched = this.optOut.matchKeyword(input.inboundText, keywords);
      if (matched) {
        await this.optOut.add({
          phone: input.phone,
          scope: 'GLOBAL',
          reason: `Inbound keyword: ${matched}`,
          source: 'inbound_keyword',
        });
        if (cfg.optOutConfirmMessage && cfg.optOutConfirmMessage.trim()) {
          await this.sendAutoReply({
            cfg,
            conversationId: input.conversationId,
            phone: input.phone,
            body: cfg.optOutConfirmMessage,
            kind: 'opt-out-confirm',
          });
        }
      }
    }

    if (input.buttonInfo && !input.isBotButton) {
      await this.handleButtonAction({
        cfg,
        conversationId: input.conversationId,
        phone: input.phone,
        button: input.buttonInfo,
        botFeatureOn,
      });
    }
  }

  /**
   * Resuelve el action del botón (vía template.buttonActions o defaults) y lo
   * aplica. BAJA dispara también el optOutConfirmMessage para mantener paridad
   * con el opt-out por keyword.
   */
  private async handleButtonAction(input: {
    cfg: {
      id: string;
      phoneNumberId: string;
      accessTokenEnc: string;
      isTestMode: boolean;
      optOutConfirmMessage: string | null;
      botEnabled: boolean;
      botFlow: unknown;
      botSessionTtlMin: number;
      botTopics: unknown;
      botRouter: unknown;
      botVariables: unknown;
    };
    conversationId: string;
    phone: string;
    button: ExtractedButtonInfo;
    botFeatureOn: boolean;
  }): Promise<void> {
    const resolved = await this.buttonActions.resolve({
      buttonId: input.button.buttonId,
      contextMetaMessageId: input.button.contextMetaMessageId,
    });
    if (!resolved) {
      this.logger.debug(
        `Button reply sin action mapeada buttonId=${input.button.buttonId} convId=${input.conversationId}`,
      );
      return;
    }
    await this.buttonActions.apply({
      conversationId: input.conversationId,
      configId: input.cfg.id,
      phone: input.phone,
      action: resolved.action,
      buttonId: input.button.buttonId,
      buttonText: input.button.buttonText ?? undefined,
      contextMetaMessageId: input.button.contextMetaMessageId,
    });
    if (resolved.action === 'BAJA' && input.cfg.optOutConfirmMessage && input.cfg.optOutConfirmMessage.trim()) {
      await this.sendAutoReply({
        cfg: input.cfg,
        conversationId: input.conversationId,
        phone: input.phone,
        body: input.cfg.optOutConfirmMessage,
        kind: 'opt-out-confirm',
      });
    }
    // 4.O.1 — Acción BOT: el payload del botón (buttonId) pasa por el router
    // del bot, que decide qué tema arrancar. Rompe cualquier sesión activa por
    // diseño — un payload nuevo manda. Si el feature está off (env u org),
    // ignoramos silenciosamente: el payload llegó pero no podemos servirlo.
    if (resolved.action === 'BOT') {
      if (!input.botFeatureOn || !input.cfg.botEnabled) {
        this.logger.debug(
          `BOT action ignored (feature off) configId=${input.cfg.id} buttonId=${input.button.buttonId}`,
        );
        return;
      }
      const match = this.botRouter.resolve(
        this.parseRouter(input.cfg.botRouter),
        { kind: 'template-payload', payload: input.button.buttonId },
      );
      if (!match) {
        this.logger.warn(
          `BOT action sin topic resuelto buttonId=${input.button.buttonId} configId=${input.cfg.id}`,
        );
        return;
      }
      await this.botEngine.startTopic(
        {
          id: input.cfg.id,
          phoneNumberId: input.cfg.phoneNumberId,
          accessTokenEnc: input.cfg.accessTokenEnc,
          isTestMode: input.cfg.isTestMode,
          botEnabled: input.cfg.botEnabled,
          botFlow: input.cfg.botFlow,
          botSessionTtlMin: input.cfg.botSessionTtlMin,
          botTopics: input.cfg.botTopics,
          botRouter: input.cfg.botRouter,
          botVariables: (input.cfg as unknown as { botVariables?: unknown }).botVariables,
        },
        input.conversationId,
        input.phone,
        match.topicId,
        match.seedData,
      );
    }
  }

  /** Parser barato para router: el engine ya lo valida; acá sólo lo necesitamos
   *  como objeto opaco para el RouterService. */
  private parseRouter(raw: unknown): import('../bot/wapi-bot.types').BotRouter | null {
    if (!raw || typeof raw !== 'object') return null;
    return raw as import('../bot/wapi-bot.types').BotRouter;
  }

  /**
   * Envía un texto del sistema (welcome / opt-out confirm) y lo persiste como
   * WapiMessage(fromMe=true, status='sent'). Emite los mismos socket events
   * que un envío manual del inbox para que el frontend lo vea sin refrescar.
   * Errores se loggean pero no se propagan — la auto-reply es best-effort.
   */
  private async sendAutoReply(input: {
    cfg: {
      id: string;
      phoneNumberId: string;
      accessTokenEnc: string;
      isTestMode: boolean;
    };
    conversationId: string;
    phone: string;
    body: string;
    kind: 'welcome' | 'opt-out-confirm';
  }): Promise<void> {
    try {
      const result = await this.sender.sendText(
        {
          phoneNumberId: input.cfg.phoneNumberId,
          accessToken: this.encryption.decrypt(input.cfg.accessTokenEnc),
          isTestMode: input.cfg.isTestMode,
        },
        { to: input.phone, body: input.body, previewUrl: false },
      );
      const ts = new Date();
      const message = await this.prisma.scoped.wapiMessage.create({
        data: {
          conversationId: input.conversationId,
          metaMessageId: result.metaMessageId,
          fromMe: true,
          type: 'text',
          content: { text: { body: input.body }, system: { kind: input.kind } } as Prisma.InputJsonValue,
          status: 'sent',
          timestamp: ts,
        } as never,
        select: { id: true, content: true },
      });
      const ctx = TenantContext.current();
      if (ctx) {
        this.events.emitToTeam(ctx.teamId, 'wapi.message.new', {
          conversationId: input.conversationId,
          configId: input.cfg.id,
          phone: input.phone,
          message: {
            id: message.id,
            fromMe: true,
            type: 'text',
            content: message.content,
            status: 'sent',
            timestamp: ts.toISOString(),
            metaMessageId: result.metaMessageId,
          },
        });
      }
      this.logger.log(`Auto-reply ${input.kind} enviado a ${input.phone} (configId=${input.cfg.id})`);
    } catch (err) {
      const detail = err instanceof WapiSendException ? err.detail.message : err instanceof Error ? err.message : String(err);
      this.logger.warn(`Auto-reply ${input.kind} falló para ${input.phone}: ${detail}`);
    }
  }
}

/**
 * Extrae info de un button reply en cualquiera de las dos shapes que Meta usa:
 *  - `interactive.button_reply` — templates modernos con quick_reply buttons.
 *  - `button.payload` — templates aprobados con call-to-action legacy.
 * Devuelve null si el msg no es un button reply.
 */
function extractButtonInfo(msg: WapiWebhookMessage): ExtractedButtonInfo | null {
  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return {
      buttonId: msg.interactive.button_reply.id,
      buttonText: msg.interactive.button_reply.title ?? null,
      contextMetaMessageId: msg.context?.id ?? null,
      shape: 'interactive',
    };
  }
  if (msg.type === 'button' && msg.button) {
    return {
      buttonId: msg.button.payload,
      buttonText: msg.button.text ?? null,
      contextMetaMessageId: msg.context?.id ?? null,
      shape: 'button',
    };
  }
  return null;
}

function extractMediaInfo(msg: WapiWebhookMessage): InboundMediaInfo | null {
  switch (msg.type) {
    case 'image':
      if (!msg.image) return null;
      return {
        mediaId: msg.image.id,
        mime: msg.image.mime_type,
        sha256FromMeta: msg.image.sha256,
        caption: msg.image.caption,
      };
    case 'audio':
      if (!msg.audio) return null;
      return {
        mediaId: msg.audio.id,
        mime: msg.audio.mime_type,
        sha256FromMeta: msg.audio.sha256,
      };
    case 'video':
      if (!msg.video) return null;
      return {
        mediaId: msg.video.id,
        mime: msg.video.mime_type,
        sha256FromMeta: msg.video.sha256,
        caption: msg.video.caption,
      };
    case 'document':
      if (!msg.document) return null;
      return {
        mediaId: msg.document.id,
        mime: msg.document.mime_type,
        caption: msg.document.caption,
        filename: msg.document.filename,
      };
    case 'sticker':
      if (!msg.sticker) return null;
      return {
        mediaId: msg.sticker.id,
        mime: msg.sticker.mime_type,
        sha256FromMeta: msg.sticker.sha256,
      };
    default:
      return null;
  }
}

/** 4.R — Preview corto del cuerpo para logs. No reemplaza extractContent
 *  (que persiste todo el subobjeto raw); solo da un summary humano para Dozzle. */
function inboundBodyPreview(msg: WapiWebhookMessage): string | undefined {
  const m = msg as unknown as Record<string, any>;
  if (msg.type === 'text') return m.text?.body;
  if (msg.type === 'button') return m.button?.text ?? m.button?.payload;
  if (msg.type === 'interactive') {
    return (
      m.interactive?.button_reply?.title ??
      m.interactive?.list_reply?.title ??
      m.interactive?.nfm_reply?.body
    );
  }
  if (msg.type === 'reaction') return m.reaction?.emoji;
  if (m.image?.caption || m.video?.caption || m.document?.caption) {
    return m.image?.caption ?? m.video?.caption ?? m.document?.caption;
  }
  if (m.document?.filename) return `[${msg.type}] ${m.document.filename}`;
  return undefined;
}

function extractContent(msg: WapiWebhookMessage): Record<string, unknown> {
  // Persistimos el sub-objeto del tipo + context cuando exista. El objeto raw
  // de Meta tiene mucho más detalle que sólo `text.body` — guardamos todo lo
  // útil para que el inbox lo renderice cuando se construya 4.F.
  const content: Record<string, unknown> = {};
  const passthroughKeys = [
    'text',
    'image',
    'audio',
    'video',
    'document',
    'sticker',
    'button',
    'interactive',
    'reaction',
  ] as const;
  for (const k of passthroughKeys) {
    const v = (msg as unknown as Record<string, unknown>)[k];
    if (v !== undefined) content[k] = v;
  }
  if (msg.context) content.context = msg.context;
  return content;
}
