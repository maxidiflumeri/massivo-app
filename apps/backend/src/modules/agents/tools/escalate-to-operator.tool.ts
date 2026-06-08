import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { AgentTool, AgentToolContext, AgentToolResult } from './agent-tool.types';

/**
 * Tool built-in killer: el agente IA deriva la conversación a un **operador
 * humano** del inbox. Misma semántica que un HANDOFF del bot: escala
 * (`escalated`), suspende el agente (`botSuspended`) y prioriza. Emite el update
 * al inbox + notifica al equipo (balde "sin asignar"). Este es el puente
 * agente↔inbox que es el MOAT de hacerlo dentro de Massivo.
 */
@Injectable()
export class EscalateToOperatorTool implements AgentTool {
  private readonly logger = new Logger(EscalateToOperatorTool.name);

  readonly def = {
    name: 'escalate_to_operator',
    description:
      'Derivá la conversación a un operador humano. Usala SOLO cuando el usuario pide ' +
      'explícitamente hablar con una persona, está claramente frustrado/enojado, o cuando ya ' +
      'intentaste ayudar y el pedido excede lo que podés resolver. NO la uses ante saludos, ' +
      'presentaciones, preguntas generales ni en el primer mensaje: primero conversá y tratá de ayudar.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Motivo breve de la derivación, para que el operador tenga contexto.',
        },
      },
      required: ['reason'],
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim() : 'Derivado por el agente IA';
    try {
      const updated = await this.prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { escalated: true, botSuspended: true, priority: true },
        select: {
          id: true,
          status: true,
          assignedUserId: true,
          unreadCount: true,
          lastMessageAt: true,
          priority: true,
          name: true,
        },
      });
      this.events.emitToTeam(ctx.teamId, 'conversation.updated', {
        id: updated.id,
        channelId: ctx.channelId,
        channelKind: ctx.channelKind,
        externalUserId: ctx.externalUserId,
        status: updated.status,
        assignedUserId: updated.assignedUserId,
        lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
        unreadCount: updated.unreadCount,
        priority: updated.priority,
      });
      await this.notifications.notifyEscalation({
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        conversationId: ctx.conversationId,
        channelId: ctx.channelId,
        channelKind: ctx.channelKind,
        externalUserId: ctx.externalUserId,
        name: updated.name,
      });
      return {
        content: `Conversación escalada a un operador humano (motivo: ${reason}). Avisale al usuario, en tono cordial, que un agente lo va a atender en breve.`,
        // Terminal: tras escalar cortamos el loop. El runtime usa el texto que el
        // modelo haya redactado en este turno, o un cierre por defecto.
        stop: true,
      };
    } catch (err) {
      this.logger.warn(`escalate falló conv=${ctx.conversationId}: ${err instanceof Error ? err.message : String(err)}`);
      return { content: 'No se pudo escalar la conversación en este momento; intentá ayudar al usuario igual.' };
    }
  }
}
