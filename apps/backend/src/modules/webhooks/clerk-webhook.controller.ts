import { Controller, Post, Req, Res, Headers, Logger, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';
import { ClerkWebhookService } from './clerk-webhook.service';
import { Request, Response } from 'express';
import { ObservabilityContext } from '../../common/observability/observability-context';
import { EventLogger } from '../../common/observability/event-logger.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly clerkWebhookService: ClerkWebhookService,
    private readonly eventLogger: EventLogger,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Faltan headers svix' });
    }

    const payload = req.rawBody?.toString('utf8');
    if (!payload) {
      return res.status(400).json({ error: 'Falta rawBody en el request. Revisa la config de NestJS.' });
    }

    const secret = this.configService.get<string>('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET no configurado');
      return res.status(500).json({ error: 'Webhook no configurado' });
    }

    const wh = new Webhook(secret);
    let evt: { type: string; data: Record<string, unknown> };

    try {
      evt = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as { type: string; data: Record<string, unknown> };
    } catch (err) {
      this.logger.error('Error verificando el webhook', err);
      return res.status(400).json({ error: 'Firma inválida' });
    }

    const { type } = evt;

    // svix-id es el identificador único del delivery — útil para correlar
    // recibido vs procesado y para deduplicar manualmente si hace falta.
    ObservabilityContext.augment({ webhookEventId: svixId });
    this.eventLogger.webhookReceived({
      provider: 'clerk',
      eventType: type,
      eventId: svixId,
    });
    const startedAt = Date.now();

    try {
      switch (type) {
        case 'user.created':
          await this.clerkWebhookService.handleUserCreated(evt);
          break;
        case 'user.updated':
          await this.clerkWebhookService.handleUserUpdated(evt);
          break;
        case 'user.deleted':
          await this.clerkWebhookService.handleUserDeleted(evt);
          break;
        case 'organization.created':
          await this.clerkWebhookService.handleOrganizationCreated(evt);
          break;
        case 'organization.updated':
          await this.clerkWebhookService.handleOrganizationUpdated(evt);
          break;
        case 'organization.deleted':
          await this.clerkWebhookService.handleOrganizationDeleted(evt);
          break;
        case 'organizationMembership.created':
          await this.clerkWebhookService.handleOrganizationMembershipCreated(evt);
          break;
        case 'organizationMembership.updated':
          await this.clerkWebhookService.handleOrganizationMembershipUpdated(evt);
          break;
        case 'organizationMembership.deleted':
          await this.clerkWebhookService.handleOrganizationMembershipDeleted(evt);
          break;
        default:
          this.logger.log(`Evento de Clerk ignorado: ${type}`);
      }

      this.eventLogger.webhookProcessed({
        provider: 'clerk',
        eventType: type,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      this.logger.error(`Error procesando evento ${type}`, error);
      this.eventLogger.webhookProcessed({
        provider: 'clerk',
        eventType: type,
        success: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
      return res.status(500).json({ error: 'Error interno procesando webhook' });
    }
  }
}
