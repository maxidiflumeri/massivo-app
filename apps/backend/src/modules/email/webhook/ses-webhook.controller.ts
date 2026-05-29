import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantScope } from '../../../common/auth/skip-tenant-scope.decorator';
import { SesWebhookService } from './ses-webhook.service';
import { SnsValidatorAdapter } from './sns-validator.adapter';
import type { SesEventNotification, SnsMessage } from './sns-types';

/**
 * Webhook SNS al que SES publica eventos. Endpoint público — SNS no manda
 * Authorization, la confianza viene de la firma RSA del payload (validada con
 * sns-validator). Sin Clerk, sin tenant guard. `@SkipTenantScope` por las dudas
 * por si alguien usa el cliente raíz acá.
 *
 * SNS envía 3 tipos de mensajes:
 *   - SubscriptionConfirmation: hay que GETear `SubscribeURL` para confirmar.
 *   - UnsubscribeConfirmation: aviso, no requiere acción.
 *   - Notification: payload SES en `Message` (string JSON).
 *
 * Siempre 200 si la firma es válida — devolver 4xx/5xx hace que SNS reintente.
 */
@Controller('webhooks/ses')
@SkipTenantScope()
export class SesWebhookController {
  private readonly logger = new Logger(SesWebhookController.name);

  constructor(
    private readonly validator: SnsValidatorAdapter,
    private readonly webhook: SesWebhookService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    // SNS publica con Content-Type "text/plain; charset=UTF-8" — el parser
    // JSON default de NestJS no lo procesa. Tomamos rawBody (Buffer) y
    // hacemos JSON.parse manual; es lo más quirúrgico para no afectar
    // otros endpoints.
    let body: SnsMessage;
    try {
      const raw = req.rawBody?.toString('utf-8');
      if (!raw) throw new Error('rawBody vacío');
      body = JSON.parse(raw) as SnsMessage;
    } catch (err) {
      throw new BadRequestException(
        `No se pudo parsear body SNS: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!body || typeof body.Type !== 'string') {
      throw new BadRequestException('Payload SNS inválido');
    }

    await this.validator.validate(body);

    if (body.Type === 'SubscriptionConfirmation') {
      if (!body.SubscribeURL) throw new BadRequestException('SubscribeURL faltante');
      await fetch(body.SubscribeURL).catch((err) => {
        this.logger.warn(`SubscribeURL fetch falló: ${err instanceof Error ? err.message : err}`);
      });
      this.logger.log(`SNS subscription confirmada: topic=${body.TopicArn}`);
      return { ok: true };
    }

    if (body.Type === 'UnsubscribeConfirmation') {
      this.logger.warn(`SNS topic ${body.TopicArn} se desuscribió`);
      return { ok: true };
    }

    let event: SesEventNotification;
    try {
      event = JSON.parse(body.Message) as SesEventNotification;
    } catch {
      throw new BadRequestException('Message no es JSON válido');
    }
    await this.webhook.process(event);
    return { ok: true };
  }
}
