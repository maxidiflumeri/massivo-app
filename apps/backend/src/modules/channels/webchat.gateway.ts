import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { RequestContext } from '@massivo/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EventsService } from '../events/events.service';
import { ConversationIngestService, type IngestChannel } from './conversation-ingest.service';
import type { InboundMessage } from './adapter.types';

const CHANNEL_SELECT = {
  id: true,
  organizationId: true,
  teamId: true,
  kind: true,
  accessTokenEnc: true,
  isTestMode: true,
  phoneNumberId: true,
  pageId: true,
  bot: {
    select: { enabled: true, flow: true, sessionTtlMin: true, topics: true, router: true, variables: true },
  },
  agent: {
    select: { enabled: true, model: true, systemPrompt: true, temperature: true, maxSteps: true },
  },
} as const;

interface VisitorInboundDto {
  text?: string;
  buttonId?: string;
}

/**
 * Fase 4 — Gateway WS del widget de Webchat (namespace `/webchat`). El visitante es
 * **anónimo** (no es del equipo): se conecta con `{ channelKey, visitorId }` en el
 * handshake. Resuelve el `Channel` WEBCHAT por su widget key (columna `pageId`), une
 * el socket a su sala `wc:<channelId>:<visitorId>` (donde el `WebchatAdapter` empuja
 * las respuestas) e ingiere cada mensaje del visitante por el `ConversationIngestService`
 * (agnóstico) dentro del TenantContext del canal — igual criterio que los webhooks.
 */
@WebSocketGateway({ namespace: 'webchat', cors: { origin: '*' } })
export class WebchatGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(WebchatGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly ingest: ConversationIngestService,
  ) {}

  afterInit(server: Namespace): void {
    this.events.setWebchatServer(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const channelKey = String(socket.handshake.auth?.channelKey ?? '').trim();
    const visitorId = String(socket.handshake.auth?.visitorId ?? '').trim();
    if (!channelKey || !visitorId) {
      socket.disconnect(true);
      return;
    }
    const channel = await this.resolveByKey(channelKey);
    if (!channel) {
      this.logger.warn(`webchat connect rechazado: channelKey inválido`);
      socket.disconnect(true);
      return;
    }
    socket.data.channelId = channel.id;
    socket.data.visitorId = visitorId;
    await socket.join(EventsService.webchatRoom(channel.id, visitorId));
    socket.emit('ready', { channelId: channel.id, visitorId });
  }

  @SubscribeMessage('message')
  async onMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: VisitorInboundDto,
  ): Promise<void> {
    const channelId = socket.data.channelId as string | undefined;
    const visitorId = socket.data.visitorId as string | undefined;
    if (!channelId || !visitorId) return;
    if (!body?.text?.trim() && !body?.buttonId) return;

    const channel = await this.resolveById(channelId);
    if (!channel) return;

    const inbound = buildInbound(visitorId, body);
    const ctx: RequestContext = {
      userId: 'system:webchat',
      organizationId: channel.organizationId,
      teamId: channel.teamId,
      orgRole: 'OWNER',
      teamRole: 'ADMIN',
    };
    await TenantContext.run(ctx, () => this.ingest.ingest(channel, [inbound]));
  }

  private async resolveByKey(channelKey: string): Promise<IngestChannel | null> {
    return (await this.prisma.channel.findFirst({
      where: { kind: 'WEBCHAT' as never, pageId: channelKey, isActive: true },
      select: CHANNEL_SELECT,
    })) as IngestChannel | null;
  }

  private async resolveById(id: string): Promise<IngestChannel | null> {
    return (await this.prisma.channel.findFirst({
      where: { id, kind: 'WEBCHAT' as never },
      select: CHANNEL_SELECT,
    })) as IngestChannel | null;
  }
}

function buildInbound(visitorId: string, body: VisitorInboundDto): InboundMessage {
  const id = `wc_in_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (body.buttonId) {
    return {
      channelKind: 'WEBCHAT',
      externalUserId: visitorId,
      externalMessageId: id,
      timestamp: new Date(),
      type: 'interactive_reply',
      interactiveReplyId: body.buttonId,
      text: body.text,
    };
  }
  return {
    channelKind: 'WEBCHAT',
    externalUserId: visitorId,
    externalMessageId: id,
    timestamp: new Date(),
    type: 'text',
    text: body.text ?? '',
  };
}
