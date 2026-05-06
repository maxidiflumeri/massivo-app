import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EncryptionService } from '../../../common/security/encryption.service';
import { EventsService } from '../../events/events.service';
import { WapiSenderService } from '../sender/wapi-sender.service';
import { WapiSendException } from '../sender/wapi-sender.types';
import {
  BOT_MAX_AUTO_CHAIN,
  BOT_OPTION_PREFIX,
  validateBotFlow,
  type BotFlow,
  type BotNode,
} from './wapi-bot.types';

/**
 * Trigger del motor: el inbound puede ser un texto (cliente arrancando o sin
 * sesión) o un button reply (cliente eligiendo una opción del bot). El motor
 * decide en base a (a) si hay sesión activa y (b) tipo del inbound.
 */
export interface BotEngineInput {
  configId: string;
  conversationId: string;
  phone: string;
  /** Tipo del inbound: texto crudo o button reply (con su id y opcional context). */
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
}

interface SessionRow {
  id: string;
  currentNodeId: string;
  expiresAt: Date;
  endedAt: Date | null;
}

/**
 * Motor de bot guiado (4.M). Es invocado desde `WapiWebhookService.tryAutoReplies`
 * antes que welcome / opt-out / 4.K. Si el bot está apagado o el flow es inválido,
 * `handle()` devuelve { handled: false } y el webhook continúa con el flujo
 * normal. Si lo maneja, devuelve { handled: true } y el resto se skipea (excepto
 * welcome de primera conversación, que el caller decide).
 *
 * Estado por (configId, phone) en `WapiBotSession`. La sesión expira tras
 * `botSessionTtlMin` minutos sin inbound. Si llega un button reply con prefijo
 * `bot:` y NO hay sesión activa, lo ignoramos (no es para nosotros — pudo ser
 * de otro template). Si llega un texto y no hay sesión, arrancamos en
 * `startNodeId`.
 */
@Injectable()
export class WapiBotEngineService {
  private readonly logger = new Logger(WapiBotEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sender: WapiSenderService,
    private readonly encryption: EncryptionService,
  ) {}

  isBotButtonId(buttonId: string | null | undefined): boolean {
    return typeof buttonId === 'string' && buttonId.startsWith(BOT_OPTION_PREFIX);
  }

  /**
   * Punto de entrada del motor. Devuelve `handled=true` si tomó cargo del
   * inbound (en cuyo caso el caller no debe disparar welcome/opt-out/4.K
   * para este mensaje).
   */
  async handle(cfg: CfgForEngine, input: BotEngineInput): Promise<{ handled: boolean; ended?: boolean; escalate?: boolean }> {
    if (!cfg.botEnabled || !cfg.botFlow) return { handled: false };
    const validation = validateBotFlow(cfg.botFlow);
    if (!validation.ok || !validation.flow) {
      this.logger.warn(`Bot flow inválido configId=${cfg.id}: ${validation.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
      return { handled: false };
    }
    const flow = validation.flow;
    const session = await this.findActiveSession(cfg.id, input.phone);

    let nextNodeId: string | null = null;
    if (input.inbound.kind === 'button') {
      if (!this.isBotButtonId(input.inbound.buttonId)) {
        // Es un button reply de template (4.K), no nos compete.
        return { handled: false };
      }
      if (!session) {
        // Botón de bot pero sin sesión activa — la sesión expiró o el cliente
        // tocó un mensaje viejo. Lo ignoramos silenciosamente (no relanzamos
        // el flow desde 0 para no crear loops).
        this.logger.debug(`Bot button sin sesión activa configId=${cfg.id} phone=${input.phone} button=${input.inbound.buttonId}`);
        return { handled: true };
      }
      const node = flow.nodes[session.currentNodeId];
      if (!node || node.kind !== 'MENU') {
        await this.endSession(session.id, 'invalid-state');
        return { handled: true };
      }
      const optionId = input.inbound.buttonId.slice(BOT_OPTION_PREFIX.length);
      const opt = node.options.find((o) => o.id === optionId);
      if (!opt) {
        // Botón con id no encontrado en el nodo actual (botón viejo de un nodo
        // anterior). Re-mostramos el nodo actual para que reintente.
        await this.deliverNode(cfg, input.conversationId, input.phone, session.currentNodeId, flow);
        return { handled: true };
      }
      nextNodeId = opt.nextNodeId;
    } else {
      // Texto inbound: si hay sesión activa, lo tratamos como "el cliente no
      // entendió" → re-mostramos el nodo actual. Si no hay sesión, arrancamos
      // el bot en startNodeId.
      if (session) {
        const node = flow.nodes[session.currentNodeId];
        if (node && node.kind === 'MENU') {
          await this.deliverNode(cfg, input.conversationId, input.phone, session.currentNodeId, flow);
          return { handled: true };
        }
        // Estado inconsistente — cerrar y rearrancar.
        await this.endSession(session.id, 'invalid-state');
      }
      nextNodeId = flow.startNodeId;
    }

    if (!nextNodeId) return { handled: true };

    // Encadenamos MESSAGE→MESSAGE→...→MENU|HANDOFF en un solo inbound.
    // Si el chain no llega a MENU/HANDOFF (MESSAGE terminal o tope alcanzado),
    // el último nodo es el `final` y queda como currentNodeId de la sesión.
    let currentId: string | null = nextNodeId;
    let finalNode: BotNode | null = null;
    let finalId: string | null = null;
    for (let i = 0; i < BOT_MAX_AUTO_CHAIN; i++) {
      if (!currentId) break;
      const node: BotNode | undefined = flow.nodes[currentId];
      if (!node) {
        this.logger.warn(`Bot nextNodeId no existe: ${currentId} (configId=${cfg.id})`);
        break;
      }
      await this.deliverNode(cfg, input.conversationId, input.phone, currentId, flow);
      finalNode = node;
      finalId = currentId;
      if (node.kind === 'MESSAGE' && node.nextNodeId) {
        currentId = node.nextNodeId;
        continue;
      }
      break;
    }

    if (!finalNode || !finalId) return { handled: true };

    if (finalNode.kind === 'HANDOFF') {
      if (session) await this.endSession(session.id, 'handoff');
      return { handled: true, ended: true, escalate: !!finalNode.escalate };
    }

    // MENU o MESSAGE (terminal silencioso) — upsert sesión con final node.
    await this.upsertSession(cfg, input.phone, finalId);
    return { handled: true };
  }

  /**
   * Cierra la sesión activa para un (config, phone) si existe. Llamado cuando
   * el operador toma manual la conversación (asignación) o resuelve.
   */
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
      this.logger.warn(`endSessionsForConversation falló: ${err instanceof Error ? err.message : String(err)}`);
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
      select: { id: true, currentNodeId: true, expiresAt: true, endedAt: true },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await this.endSession(row.id, 'expired');
      return null;
    }
    return row;
  }

  private async upsertSession(cfg: CfgForEngine, phone: string, nodeId: string): Promise<void> {
    const ctx = TenantContext.current();
    if (!ctx) return;
    const ttlMs = Math.max(1, cfg.botSessionTtlMin) * 60_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const existing: SessionRow | null = await this.prismaSession.findFirst({
      where: { configId: cfg.id, phone, endedAt: null },
      select: { id: true, currentNodeId: true, expiresAt: true, endedAt: true },
    });
    if (existing) {
      await this.prismaSession.update({
        where: { id: existing.id },
        data: { currentNodeId: nodeId, lastInboundAt: now, expiresAt },
      });
    } else {
      await this.prismaSession.create({
        data: {
          organizationId: ctx.organizationId,
          teamId: ctx.teamId,
          configId: cfg.id,
          phone,
          currentNodeId: nodeId,
          startedAt: now,
          lastInboundAt: now,
          expiresAt,
        },
      });
    }
  }

  private async endSession(id: string, reason: string): Promise<void> {
    await this.prismaSession.update({
      where: { id },
      data: { endedAt: new Date(), endedReason: reason.slice(0, 80) },
    });
  }

  /**
   * Envía el mensaje correspondiente al nodo (interactive si MENU, texto plano
   * si MESSAGE/HANDOFF) y lo persiste como WapiMessage(fromMe=true). Emite el
   * evento de socket para que el inbox actualice sin refrescar.
   */
  private async deliverNode(
    cfg: CfgForEngine,
    conversationId: string,
    phone: string,
    nodeId: string,
    flow: BotFlow,
  ): Promise<void> {
    const node = flow.nodes[nodeId];
    if (!node) return;
    try {
      const senderCfg = {
        phoneNumberId: cfg.phoneNumberId,
        accessToken: this.encryption.decrypt(cfg.accessTokenEnc),
        isTestMode: cfg.isTestMode,
      };
      const result =
        node.kind === 'MENU'
          ? await this.sender.sendInteractiveButtons(senderCfg, {
              to: phone,
              body: node.text,
              header: node.header,
              footer: node.footer,
              buttons: node.options.slice(0, 3).map((o) => ({
                id: `${BOT_OPTION_PREFIX}${o.id}`,
                title: o.label,
              })),
            })
          : await this.sender.sendText(senderCfg, { to: phone, body: node.text, previewUrl: false });
      const ts = new Date();
      const content = buildPersistedContent(node);
      const wapiType = node.kind === 'MENU' ? 'interactive' : 'text';
      const message = await this.prismaMessage.create({
        data: {
          conversationId,
          metaMessageId: result.metaMessageId,
          fromMe: true,
          type: wapiType,
          content: content as Prisma.InputJsonValue,
          status: 'sent',
          timestamp: ts,
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
      const detail = err instanceof WapiSendException ? err.detail.message : err instanceof Error ? err.message : String(err);
      this.logger.warn(`Bot deliverNode ${nodeId} falló para ${phone}: ${detail}`);
    }
  }
}

function buildPersistedContent(node: BotNode): Record<string, unknown> {
  if (node.kind === 'MENU') {
    return {
      interactive: {
        type: 'button',
        body: { text: node.text },
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
      text: { body: node.text },
      system: { kind: 'bot-message' },
    };
  }
  return {
    text: { body: node.text },
    system: { kind: 'bot-handoff', escalate: !!node.escalate },
  };
}
