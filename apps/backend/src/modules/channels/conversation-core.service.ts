import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const WINDOW_24H_MS = 24 * 60 * 60_000;

export interface UpsertedConversation {
  id: string;
  status: string;
  assignedUserId: string | null;
  unreadCount: number;
}

/**
 * Núcleo compartido del inbound (Fase B de consolidación). Hoy el upsert de
 * `Conversation` por (channelId, externalUserId) estaba duplicado casi verbatim en el
 * webhook de WhatsApp (`WapiWebhookService`) y en el ingest agnóstico
 * (`ConversationIngestService`, Messenger/IG/Webchat). Es la parte más delicada (race
 * P2002, transición WAITING→UNASSIGNED, ventana freeform de 24h), donde viven los bugs
 * sutiles → se centraliza acá. La persistencia del mensaje y los eventos siguen por
 * canal (WhatsApp baja media binaria, emite el evento legacy y persiste columnas de
 * media; el genérico no) para NO cambiar el comportamiento de WhatsApp.
 *
 * Vive registrado en `WapiModule` (junto a los adapters/registry) para que tanto
 * `WapiWebhookService` (mismo módulo) como `ConversationIngestService` (ChannelsModule
 * importa WapiModule) lo inyecten sin ciclo.
 */
@Injectable()
export class ConversationCoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert de la conversación. Devuelve la conversación y `isFirst` (true cuando no
   * existía al momento del findFirst — lo usa el welcome de WhatsApp). Idempotente: si
   * dos webhooks corren en simultáneo, el unique `(teamId, channelId, externalUserId)`
   * tira P2002 y refetcheamos.
   */
  async upsertConversation(input: {
    organizationId: string;
    teamId: string;
    channelId: string;
    channelKind: string;
    externalUserId: string;
    timestamp: Date;
    profileName?: string | null;
  }): Promise<{ conversation: UpsertedConversation; isFirst: boolean }> {
    const { organizationId, teamId, channelId, channelKind, externalUserId } = input;
    const ts = input.timestamp;
    const profileName = input.profileName ?? null;

    const existing = await this.prisma.scoped.conversation.findFirst({
      where: { channelId, externalUserId },
      select: { id: true, status: true, assignedUserId: true, unreadCount: true },
    });
    const isFirst = !existing;
    let conversation: UpsertedConversation;

    if (existing) {
      // El cliente respondió → si estaba en espera, sale de espera. NO auto-reopen de
      // RESOLVED (el bot decide si escalar).
      const waitingTransition =
        existing.status === 'WAITING' ? { status: 'UNASSIGNED', waitingUntil: null } : {};
      conversation = await this.prisma.scoped.conversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: ts,
          freeformWindowAt: new Date(ts.getTime() + WINDOW_24H_MS),
          unreadCount: { increment: 1 },
          ...(profileName ? { name: profileName } : {}),
          ...waitingTransition,
        } as never,
        select: { id: true, status: true, assignedUserId: true, unreadCount: true },
      });
    } else {
      try {
        conversation = await this.prisma.scoped.conversation.create({
          data: {
            organizationId,
            teamId,
            channelId,
            channelKind,
            externalUserId,
            name: profileName,
            lastMessageAt: ts,
            freeformWindowAt: new Date(ts.getTime() + WINDOW_24H_MS),
            unreadCount: 1,
          } as never,
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        const refetched = await this.prisma.scoped.conversation.findFirst({
          where: { channelId, externalUserId },
          select: { id: true, status: true, assignedUserId: true, unreadCount: true },
        });
        if (!refetched) throw err;
        conversation = refetched;
      }
    }

    return { conversation, isFirst };
  }
}
