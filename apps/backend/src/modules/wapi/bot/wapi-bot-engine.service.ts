import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import { WapiSendException } from '../sender/wapi-sender.types';
import { interpolate } from './interpolate';
import {
  BOT_MAX_AUTO_CHAIN,
  BOT_OPTION_PREFIX,
  type BotFlow,
  type BotMediaNode,
  type BotNode,
} from './wapi-bot.types';
import {
  DEFAULT_TOPIC_ID,
  handleCapture,
  pickConditionBranch,
  resolveTopics as resolveTopicsRuntime,
  type BotData,
  type ResolvedFlow,
} from './bot-flow-runtime';
import { WapiBotFeatureService } from './wapi-bot-feature.service';
import { WapiBotRouterService, type BotRouterInput } from './wapi-bot-router.service';

/**
 * Trigger del motor: el inbound puede ser un texto (cliente arrancando, sin
 * sesión, o respondiendo a un CAPTURE) o un button reply (cliente eligiendo
 * una opción del bot).
 */
export interface BotEngineInput {
  configId: string;
  conversationId: string;
  phone: string;
  inbound:
    | { kind: 'text'; body: string }
    | { kind: 'button'; buttonId: string; contextMetaMessageId: string | null };
}

interface CfgForEngine {
  id: string;
  phoneNumberId: string;
  accessTokenEnc: string;
  isTestMode: boolean;
  botEnabled: boolean;
  botFlow: unknown;
  botSessionTtlMin: number;
  /** 4.O.1 — multi-tema. Si null/empty, el motor materializa `botFlow` como topic 'default'. */
  botTopics?: unknown;
  botRouter?: unknown;
  /** 4.O.4 — variables declarativas (publicadas). Sembra defaults al iniciar sesión. */
  botVariables?: unknown;
}

interface SessionRow {
  id: string;
  currentNodeId: string;
  /** 4.O.1 — null en sesiones legacy. El motor lo trata como 'default'. */
  currentTopicId: string | null;
  expiresAt: Date;
  endedAt: Date | null;
  data: unknown;
}

/**
 * Motor de bot guiado (4.N + 4.N.2). Es invocado desde
 * `WapiWebhookService.tryAutoReplies` antes que welcome / opt-out / 4.K. Si el
 * bot está apagado o el flow es inválido, `handle()` devuelve { handled: false }
 * y el webhook continúa con el flujo normal. Si lo maneja, devuelve
 * { handled: true } y el resto se skipea (excepto welcome de primera
 * conversación, que el caller decide).
 *
 * Estado por (configId, phone) en `WapiBotSession`. La sesión expira tras
 * `botSessionTtlMin` minutos sin inbound. Variables capturadas por nodos
 * CAPTURE se guardan en `session.data` y se interpolan en textos posteriores
 * con `{{var}}`.
 */
@Injectable()
export class WapiBotEngineService {
  private readonly logger = new Logger(WapiBotEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sender: WapiSenderService,
    private readonly encryption: EncryptionService,
    private readonly feature: WapiBotFeatureService,
    private readonly router: WapiBotRouterService,
  ) {}

  isBotButtonId(buttonId: string | null | undefined): boolean {
    return typeof buttonId === 'string' && buttonId.startsWith(BOT_OPTION_PREFIX);
  }

  async handle(
    cfg: CfgForEngine,
    input: BotEngineInput,
  ): Promise<{ handled: boolean; ended?: boolean; escalate?: boolean }> {
    if (!cfg.botEnabled) return { handled: false };
    // 4.O.1 — feature gate (env + per-org). Sin contexto, isEnabled devuelve false.
    if (!(await this.feature.isEnabled())) return { handled: false };
    const resolved = this.resolveTopics(cfg);
    if (!resolved) return { handled: false };

    let session = await this.findActiveSession(cfg.id, input.phone);
    let data: BotData = sessionData(session);
    let currentTopicId: string = session?.currentTopicId ?? DEFAULT_TOPIC_ID;
    let currentTopic = resolved.topics.get(currentTopicId);
    if (!currentTopic) {
      currentTopic = resolved.topics.values().next().value;
      currentTopicId = currentTopic ? currentTopic.id : DEFAULT_TOPIC_ID;
    }
    if (!currentTopic) return { handled: false };

    let nextNodeId: string | null = null;
    let nextTopicId: string = currentTopicId;

    // 4.O.2 — match explícito del router (keyword/template-payload) interrumpe
    // la sesión activa y arranca el topic resuelto. Mismo patrón que BOT button
    // action ("payload nuevo siempre gana"). Los matches `default` y `fallback`
    // (catch-alls) NO interrumpen — se evalúan recién si la sesión no está apta
    // para procesar el inbound.
    if (input.inbound.kind === 'text') {
      const explicit = this.router.resolve(resolved.router, {
        kind: 'text',
        text: input.inbound.body,
      });
      if (explicit && (explicit.via === 'keyword' || explicit.via === 'template-payload')) {
        const t = resolved.topics.get(explicit.topicId);
        if (t) {
          if (session) {
            await this.endSession(session.id, 'router-restart');
            session = null;
          }
          // 4.O.4 — defaults declarados primero, luego seedData del router pisa.
          data = { ...resolved.variableDefaults, ...explicit.seedData };
          nextTopicId = t.id;
          nextNodeId = t.flow.startNodeId;
        }
      }
    }

    if (input.inbound.kind === 'button') {
      if (!this.isBotButtonId(input.inbound.buttonId)) {
        return { handled: false };
      }
      if (!session) {
        this.logger.debug(
          `Bot button sin sesión activa configId=${cfg.id} phone=${input.phone} button=${input.inbound.buttonId}`,
        );
        return { handled: true };
      }
      const node = currentTopic.flow.nodes[session.currentNodeId];
      if (!node || node.kind !== 'MENU') {
        await this.endSession(session.id, 'invalid-state');
        return { handled: true };
      }
      const optionId = input.inbound.buttonId.slice(BOT_OPTION_PREFIX.length);
      const opt = node.options.find((o) => o.id === optionId);
      if (!opt) {
        await this.deliverNode(
          cfg,
          input.conversationId,
          input.phone,
          session.currentNodeId,
          currentTopic.flow,
          data,
        );
        return { handled: true };
      }
      const target = this.followGoto(opt.gotoTopic, opt.nextNodeId, currentTopicId, resolved);
      if (!target) return { handled: true };
      nextNodeId = target.nodeId;
      nextTopicId = target.topicId;
    } else {
      // Texto inbound.
      if (session) {
        const node = currentTopic.flow.nodes[session.currentNodeId];
        if (node && node.kind === 'CAPTURE') {
          const result = handleCapture(node, input.inbound.body, data);
          if (result.ok) {
            data = result.data;
            await this.persistSessionData(session.id, data);
            const target = this.followGoto(node.gotoTopic, node.nextNodeId, currentTopicId, resolved);
            if (!target) return { handled: true };
            nextNodeId = target.nodeId;
            nextTopicId = target.topicId;
          } else if (node.retryNodeId) {
            nextNodeId = node.retryNodeId;
          } else {
            await this.deliverNode(
              cfg,
              input.conversationId,
              input.phone,
              session.currentNodeId,
              currentTopic.flow,
              data,
            );
            return { handled: true };
          }
        } else if (node && node.kind === 'MENU') {
          await this.deliverNode(
            cfg,
            input.conversationId,
            input.phone,
            session.currentNodeId,
            currentTopic.flow,
            data,
          );
          return { handled: true };
        } else {
          await this.endSession(session.id, 'invalid-state');
          session = null;
          data = {};
          // Cae al ruteo de "sin sesión".
        }
      }
      if (!nextNodeId && !session) {
        // Sin sesión: consultar router con texto. Si matchea keyword/default, entrar.
        const match = this.router.resolve(resolved.router, {
          kind: 'text',
          text: input.inbound.body,
        });
        if (match) {
          const t = resolved.topics.get(match.topicId);
          if (t) {
            // 4.O.4 — defaults primero, luego seedData del router pisa.
            data = { ...resolved.variableDefaults, ...match.seedData };
            nextTopicId = t.id;
            nextNodeId = t.flow.startNodeId;
          }
        }
        if (!nextNodeId) {
          // Backward compat: si hay topic 'default' pre-router, arrancar ahí.
          const def = resolved.topics.get(DEFAULT_TOPIC_ID);
          if (def) {
            data = { ...resolved.variableDefaults };
            nextTopicId = def.id;
            nextNodeId = def.flow.startNodeId;
          }
        }
      }
      // Sesión válida sin reachable next (caso defensivo): re-arrancar tema actual.
      if (!nextNodeId && session) {
        const t = resolved.topics.get(currentTopicId) ?? resolved.topics.get(DEFAULT_TOPIC_ID);
        if (t) {
          nextTopicId = t.id;
          nextNodeId = t.flow.startNodeId;
        }
      }
    }

    if (!nextNodeId) return { handled: true };

    return this.runChain(cfg, input.conversationId, input.phone, nextTopicId, nextNodeId, data, resolved, session);
  }

  /**
   * 4.O.1 — Inicia un tema desde un trigger externo (ej. button-action BOT
   * resolviendo un payload). Cierra cualquier sesión activa, opcional seedData
   * para variables iniciales.
   */
  async startTopic(
    cfg: CfgForEngine,
    conversationId: string,
    phone: string,
    topicId: string,
    seedData: Record<string, string> = {},
  ): Promise<{ handled: boolean; ended?: boolean; escalate?: boolean }> {
    if (!cfg.botEnabled) return { handled: false };
    if (!(await this.feature.isEnabled())) return { handled: false };
    const resolved = this.resolveTopics(cfg);
    if (!resolved) return { handled: false };
    const topic = resolved.topics.get(topicId);
    if (!topic) {
      this.logger.warn(`startTopic: topic inexistente ${topicId} configId=${cfg.id}`);
      return { handled: false };
    }
    // Cerrar sesión activa para que el tema arranque limpio.
    const existing = await this.findActiveSession(cfg.id, phone);
    if (existing) await this.endSession(existing.id, 'topic-switch');
    return this.runChain(
      cfg,
      conversationId,
      phone,
      topic.id,
      topic.flow.startNodeId,
      // 4.O.4 — defaults declarados, luego seedData del trigger externo pisa.
      { ...resolved.variableDefaults, ...seedData },
      resolved,
      null,
    );
  }

  private async runChain(
    cfg: CfgForEngine,
    conversationId: string,
    phone: string,
    startTopicId: string,
    startNodeId: string,
    initialData: BotData,
    resolved: ResolvedFlow,
    session: SessionRow | null,
  ): Promise<{ handled: boolean; ended?: boolean; escalate?: boolean }> {
    let topicId = startTopicId;
    let topic = resolved.topics.get(topicId);
    if (!topic) return { handled: true };
    let currentId: string | null = startNodeId;
    let data = initialData;
    let finalNode: BotNode | null = null;
    let finalId: string | null = null;
    let finalTopicId: string = topicId;
    for (let i = 0; i < BOT_MAX_AUTO_CHAIN; i++) {
      if (!currentId) break;
      const node: BotNode | undefined = topic.flow.nodes[currentId];
      if (!node) {
        this.logger.warn(`Bot nextNodeId no existe: ${currentId} (configId=${cfg.id} topic=${topicId})`);
        break;
      }
      if (node.kind === 'CONDITION') {
        const target = pickConditionBranch(node, data);
        if (target?.gotoTopic) {
          const next = resolved.topics.get(target.gotoTopic);
          if (!next) break;
          topic = next;
          topicId = next.id;
          currentId = next.flow.startNodeId;
          continue;
        }
        currentId = target?.nextNodeId ?? null;
        if (!currentId) break;
        continue;
      }
      await this.deliverNode(cfg, conversationId, phone, currentId, topic.flow, data);
      finalNode = node;
      finalId = currentId;
      finalTopicId = topicId;
      if ((node.kind === 'MESSAGE' || node.kind === 'MEDIA') && (node.nextNodeId || node.gotoTopic)) {
        if (node.gotoTopic) {
          const next = resolved.topics.get(node.gotoTopic);
          if (!next) break;
          topic = next;
          topicId = next.id;
          currentId = next.flow.startNodeId;
          continue;
        }
        currentId = node.nextNodeId ?? null;
        continue;
      }
      break;
    }

    if (!finalNode || !finalId) return { handled: true };

    if (finalNode.kind === 'HANDOFF') {
      if (session) await this.endSession(session.id, 'handoff');
      return { handled: true, ended: true, escalate: !!finalNode.escalate };
    }

    await this.upsertSession(cfg, phone, finalId, finalTopicId, data);
    return { handled: true };
  }

  /**
   * Resuelve el destino de un par (gotoTopic, nextNodeId): si gotoTopic está
   * seteado y existe, devuelve { topicId, startNodeId }; si no, devuelve el
   * nextNodeId en el topic actual. Null si ambos faltan.
   */
  private followGoto(
    gotoTopic: string | undefined,
    nextNodeId: string | undefined,
    currentTopicId: string,
    resolved: ResolvedFlow,
  ): { topicId: string; nodeId: string } | null {
    if (gotoTopic) {
      const t = resolved.topics.get(gotoTopic);
      if (t) return { topicId: t.id, nodeId: t.flow.startNodeId };
    }
    if (nextNodeId) return { topicId: currentTopicId, nodeId: nextNodeId };
    return null;
  }

  /**
   * Materializa el conjunto de topics + router via `resolveTopicsRuntime` y
   * loguea los errores de validación. La lógica pura vive en bot-flow-runtime.ts
   * (compartida con WapiBotSandboxService).
   */
  private resolveTopics(cfg: CfgForEngine): ResolvedFlow | null {
    const r = resolveTopicsRuntime({
      topics: cfg.botTopics,
      router: cfg.botRouter,
      flow: cfg.botFlow,
      variables: cfg.botVariables,
    });
    for (const e of r.errors) {
      this.logger.warn(
        `${e.scope === 'topics' ? 'botTopics' : e.scope === 'router' ? 'botRouter' : 'botFlow'} inválido configId=${cfg.id}: ${e.path} ${e.message}`,
      );
    }
    return r.resolved;
  }

  async endSessionsForConversation(configId: string, phone: string, reason: string): Promise<void> {
    try {
      const sessions = await this.prismaSession.findMany({
        where: { configId, phone, endedAt: null },
        select: { id: true },
      });
      for (const s of sessions) {
        await this.endSession(s.id, reason);
      }
    } catch (err) {
      this.logger.warn(
        `endSessionsForConversation falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -- internals -------------------------------------------------------------

  private get prismaSession() {
    return (this.prisma.scoped as unknown as { wapiBotSession: any }).wapiBotSession;
  }

  private get prismaMessage() {
    return this.prisma.scoped.wapiMessage;
  }

  private async findActiveSession(configId: string, phone: string): Promise<SessionRow | null> {
    const row: SessionRow | null = await this.prismaSession.findFirst({
      where: { configId, phone, endedAt: null },
      select: {
        id: true,
        currentNodeId: true,
        currentTopicId: true,
        expiresAt: true,
        endedAt: true,
        data: true,
      },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await this.endSession(row.id, 'expired');
      return null;
    }
    return row;
  }

  private async upsertSession(
    cfg: CfgForEngine,
    phone: string,
    nodeId: string,
    topicId: string,
    data: BotData,
  ): Promise<void> {
    const ctx = TenantContext.current();
    if (!ctx) return;
    const ttlMs = Math.max(1, cfg.botSessionTtlMin) * 60_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await this.prismaSession.upsert({
      where: { configId_phone: { configId: cfg.id, phone } },
      update: {
        currentNodeId: nodeId,
        currentTopicId: topicId,
        lastInboundAt: now,
        expiresAt,
        startedAt: now,
        endedAt: null,
        endedReason: null,
        data: data as Prisma.InputJsonValue,
      },
      create: {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        configId: cfg.id,
        phone,
        currentNodeId: nodeId,
        currentTopicId: topicId,
        startedAt: now,
        lastInboundAt: now,
        expiresAt,
        data: data as Prisma.InputJsonValue,
      },
    });
  }

  private async persistSessionData(sessionId: string, data: BotData): Promise<void> {
    await this.prismaSession.update({
      where: { id: sessionId },
      data: { data: data as Prisma.InputJsonValue, lastInboundAt: new Date() },
    });
  }

  private async endSession(id: string, reason: string): Promise<void> {
    await this.prismaSession.update({
      where: { id },
      data: { endedAt: new Date(), endedReason: reason.slice(0, 80) },
    });
  }

  /**
   * Envía el mensaje correspondiente al nodo y lo persiste como
   * WapiMessage(fromMe=true). Emite el evento de socket. CONDITION nunca
   * llega acá (el chain lo evalúa en memoria).
   */
  private async deliverNode(
    cfg: CfgForEngine,
    conversationId: string,
    phone: string,
    nodeId: string,
    flow: BotFlow,
    data: BotData,
  ): Promise<void> {
    const node = flow.nodes[nodeId];
    if (!node) return;
    if (node.kind === 'CONDITION') return;
    try {
      const senderCfg = {
        phoneNumberId: cfg.phoneNumberId,
        accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
        isTestMode: cfg.isTestMode,
      };
      let result;
      let wapiType: string;
      if (node.kind === 'MENU') {
        wapiType = 'interactive';
        result = await this.sender.sendInteractiveButtons(senderCfg, {
          to: phone,
          body: interpolate(node.text, data),
          header: node.header ? interpolate(node.header, data) : undefined,
          footer: node.footer ? interpolate(node.footer, data) : undefined,
          buttons: node.options.slice(0, 3).map((o) => ({
            id: `${BOT_OPTION_PREFIX}${o.id}`,
            title: o.label,
          })),
        });
      } else if (node.kind === 'MEDIA') {
        wapiType = node.mediaType;
        result = await this.sender.sendMediaById(senderCfg, {
          to: phone,
          type: node.mediaType,
          mediaId: node.mediaId,
          caption: node.caption ? interpolate(node.caption, data) : undefined,
          filename: node.filename,
        });
      } else {
        // MESSAGE | CAPTURE | HANDOFF — texto plano interpolado.
        wapiType = 'text';
        result = await this.sender.sendText(senderCfg, {
          to: phone,
          body: interpolate(node.text, data),
          previewUrl: false,
        });
      }
      const ts = new Date();
      const content = buildPersistedContent(node, data);
      const mediaCols =
        node.kind === 'MEDIA'
          ? {
              mediaId: node.mediaId,
              mediaMime: node.mediaMime ?? null,
              mediaSha256: node.mediaSha256 ?? null,
              mediaSize: node.mediaSize ?? null,
              mediaFilename: node.filename ?? null,
              mediaCaption: node.caption ? interpolate(node.caption, data) : null,
              mediaLocalPath: node.mediaLocalPath ?? null,
            }
          : {};
      const message = await this.prismaMessage.create({
        data: {
          conversationId,
          metaMessageId: result.metaMessageId,
          fromMe: true,
          type: wapiType,
          content: content as Prisma.InputJsonValue,
          status: 'sent',
          timestamp: ts,
          ...mediaCols,
        } as never,
        select: { id: true, content: true },
      });
      const ctx = TenantContext.current();
      if (ctx) {
        this.events.emitToTeam(ctx.teamId, 'wapi.message.new', {
          conversationId,
          configId: cfg.id,
          phone,
          message: {
            id: message.id,
            fromMe: true,
            type: wapiType,
            content: message.content,
            status: 'sent',
            timestamp: ts.toISOString(),
            metaMessageId: result.metaMessageId,
          },
        });
      }
      this.logger.log(`Bot nodo ${nodeId} (${node.kind}) entregado a ${phone} configId=${cfg.id}`);
    } catch (err) {
      const detail =
        err instanceof WapiSendException
          ? err.detail.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.warn(`Bot deliverNode ${nodeId} falló para ${phone}: ${detail}`);
    }
  }
}

function sessionData(session: SessionRow | null): BotData {
  if (!session || !session.data || typeof session.data !== 'object') return {};
  return { ...(session.data as BotData) };
}

function buildPersistedContent(node: BotNode, data: BotData): Record<string, unknown> {
  if (node.kind === 'MENU') {
    return {
      interactive: {
        type: 'button',
        body: { text: interpolate(node.text, data) },
        action: {
          buttons: node.options.map((o) => ({
            type: 'reply',
            reply: { id: `${BOT_OPTION_PREFIX}${o.id}`, title: o.label },
          })),
        },
      },
      system: { kind: 'bot-menu' },
    };
  }
  if (node.kind === 'MESSAGE') {
    return {
      text: { body: interpolate(node.text, data) },
      system: { kind: 'bot-message' },
    };
  }
  if (node.kind === 'CAPTURE') {
    return {
      text: { body: interpolate(node.text, data) },
      system: { kind: 'bot-capture', saveAs: node.saveAs },
    };
  }
  if (node.kind === 'MEDIA') {
    return buildMediaContent(node, data);
  }
  if (node.kind === 'HANDOFF') {
    return {
      text: { body: interpolate(node.text, data) },
      system: { kind: 'bot-handoff', escalate: !!node.escalate },
    };
  }
  return {};
}

function buildMediaContent(node: BotMediaNode, data: BotData): Record<string, unknown> {
  const caption = node.caption ? interpolate(node.caption, data) : undefined;
  const inner: Record<string, unknown> = { id: node.mediaId };
  if (caption) inner.caption = caption;
  if (node.mediaType === 'document' && node.filename) inner.filename = node.filename;
  return {
    [node.mediaType]: inner,
    system: { kind: 'bot-media', mediaType: node.mediaType },
  };
}
