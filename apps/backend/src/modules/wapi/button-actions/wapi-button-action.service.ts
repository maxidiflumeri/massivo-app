import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EventsService } from '../../events/events.service';
import { WapiOptOutService } from '../opt-out/wapi-opt-out.service';

export const BUTTON_ACTIONS = ['INBOX', 'BAJA', 'IGNORAR', 'BOT'] as const;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

/**
 * Defaults case-insensitive: si el button id matchea exactamente el nombre de
 * la acción, la disparamos sin necesidad de configurar `WapiTemplate.buttonActions`.
 * Útil para QA y para templates simples cuyos IDs ya nombran la acción.
 *
 * Para BOT, el button id típicamente es el payload (ej. `OFERTA_X_PROD_Y`) que
 * pasa por el router del bot, no `BOT` literal. Por eso no lo incluimos en los
 * defaults — debe configurarse explícitamente vía `WapiTemplate.buttonActions`.
 */
const DEFAULT_BUTTON_ACTION_BY_ID: Record<string, ButtonAction> = {
  INBOX: 'INBOX',
  BAJA: 'BAJA',
  IGNORAR: 'IGNORAR',
};

export interface ResolvedButtonAction {
  action: ButtonAction;
  source: 'template' | 'default';
}

interface ApplyInput {
  conversationId: string;
  configId: string;
  phone: string;
  action: ButtonAction;
  buttonId: string;
  buttonText?: string;
  contextMetaMessageId?: string | null;
}

/**
 * Resuelve y ejecuta acciones disparadas por botones interactive de templates
 * (4.K). Tres acciones soportadas:
 *  - **INBOX**: marca la conversación como prioridad alta (`priority=true`).
 *    El inbox tiene un filtro y un badge ⭐ para destacarlas.
 *  - **BAJA**: registra opt-out GLOBAL via `WapiOptOutService`. La auto-reply
 *    de confirmación la dispara el webhook (mismo flujo que opt-out por keyword).
 *  - **IGNORAR**: sólo loggea — semánticamente "el cliente entendió, no hay
 *    nada que hacer". No muta DB ni dispara reply.
 *
 * Resolución del action:
 *  1. Si el button vino con `context.id` apuntando a un outbound de campaña,
 *     resolvemos `WapiReport → WapiCampaign.templateId → WapiTemplate.buttonActions`
 *     y miramos si hay mapping para ese button_id.
 *  2. Fallback: defaults (button_id = "INBOX"|"BAJA"|"IGNORAR" case-insensitive).
 *  3. Si nada matchea, no acción (sólo log).
 */
@Injectable()
export class WapiButtonActionService {
  private readonly logger = new Logger(WapiButtonActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly optOut: WapiOptOutService,
  ) {}

  async resolve(input: {
    buttonId: string;
    contextMetaMessageId: string | null;
  }): Promise<ResolvedButtonAction | null> {
    const buttonId = input.buttonId.trim();
    if (!buttonId) return null;

    if (input.contextMetaMessageId) {
      const fromTemplate = await this.lookupTemplateAction(buttonId, input.contextMetaMessageId);
      if (fromTemplate) return { action: fromTemplate, source: 'template' };
    }

    const fromDefault = DEFAULT_BUTTON_ACTION_BY_ID[buttonId.toUpperCase()];
    if (fromDefault) return { action: fromDefault, source: 'default' };

    return null;
  }

  /**
   * Aplica la acción resuelta. Best-effort: errores se loggean y no rompen el
   * webhook (el inbound del cliente igual está persistido).
   */
  async apply(input: ApplyInput): Promise<void> {
    try {
      switch (input.action) {
        case 'INBOX':
          await this.applyInboxPriority(input.conversationId, input.configId, input.phone);
          break;
        case 'BAJA':
          await this.optOut.add({
            phone: input.phone,
            scope: 'GLOBAL',
            reason: `Button: ${input.buttonText ?? input.buttonId}`,
            source: 'inbound_button',
          });
          break;
        case 'IGNORAR':
          this.logger.log(
            `Button IGNORAR conversationId=${input.conversationId} buttonId=${input.buttonId}`,
          );
          break;
        case 'BOT':
          // BOT no se aplica acá — requiere BotEngineService + BotRouterService
          // y rompería el ciclo de imports. El webhook detecta action=BOT y
          // dispara `engine.startTopic` con el topic resuelto por el router.
          this.logger.log(
            `Button BOT conversationId=${input.conversationId} buttonId=${input.buttonId} (delegado al webhook)`,
          );
          break;
      }
    } catch (err) {
      this.logger.warn(
        `Button action ${input.action} falló para conversationId=${input.conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async applyInboxPriority(
    conversationId: string,
    configId: string,
    phone: string,
  ): Promise<void> {
    // 4.O.6 — INBOX también escala (visible en inbox) y suspende el bot.
    // Equivale a un HANDOFF disparado por el cliente desde el template.
    const updated = await this.prisma.scoped.conversation.update({
      where: { id: conversationId },
      data: { priority: true, escalated: true, botSuspended: true } as never,
      select: {
        id: true,
        status: true,
        assignedUserId: true,
        unreadCount: true,
        lastMessageAt: true,
        priority: true,
      },
    });
    const ctx = TenantContext.current();
    if (ctx) {
      this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
        id: updated.id,
        channelId: configId,
        channelKind: 'WHATSAPP',
        externalUserId: phone,
        status: updated.status,
        assignedUserId: updated.assignedUserId,
        lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
        unreadCount: updated.unreadCount,
        priority: updated.priority,
      });
    }
    this.logger.log(
      `Conversation ${conversationId} priority=true + escalated + botSuspended vía button INBOX`,
    );
  }

  /**
   * Resuelve action vía template.buttonActions. El path es:
   *   context.id (metaMessageId outbound) → WapiReport.campaignId
   *     → WapiCampaign.templateId → WapiTemplate.buttonActions[buttonId]
   *
   * Hacemos las queries por separado en vez de includes para mantener el
   * scoping de Prisma simple (cada findFirst respeta su tenant).
   */
  private async lookupTemplateAction(
    buttonId: string,
    contextMetaMessageId: string,
  ): Promise<ButtonAction | null> {
    const report = await this.prisma.scoped.wapiReport.findFirst({
      where: { metaMessageId: contextMetaMessageId },
      select: { campaignId: true },
    });
    if (!report) return null;
    const campaign = await this.prisma.scoped.wapiCampaign.findFirst({
      where: { id: report.campaignId },
      select: { templateId: true },
    });
    if (!campaign?.templateId) return null;
    const template = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { id: campaign.templateId },
      select: { buttonActions: true },
    });
    const map = (template?.buttonActions ?? null) as Record<string, unknown> | null;
    if (!map) return null;
    const raw = map[buttonId];
    if (raw == null) return null;
    let actionStr: string | null = null;
    if (typeof raw === 'string') {
      actionStr = raw;
    } else if (typeof raw === 'object') {
      const action = (raw as Record<string, unknown>).action;
      if (typeof action === 'string') actionStr = action;
    }
    if (!actionStr) return null;
    const upper = actionStr.toUpperCase();
    return BUTTON_ACTIONS.includes(upper as ButtonAction) ? (upper as ButtonAction) : null;
  }
}
