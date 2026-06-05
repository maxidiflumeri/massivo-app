import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantScope } from '../../../common/auth/skip-tenant-scope.decorator';
import { WhatsAppWebhookHandler } from './whatsapp-webhook.handler';

/**
 * Webhook Meta WhatsApp Cloud API — **ruta legacy** `/api/webhooks/wapi/:slug`.
 *
 * 1c: la lógica vive en `WhatsAppWebhookHandler`, compartida con la ruta genérica
 * `/api/channels/whatsapp/:slug` (`ChannelsWebhookController`). Este controller
 * queda como alias delgado para no romper los webhooks ya configurados en Meta.
 *
 * Endpoint público — Meta no manda Authorization Bearer. `@SkipTenantScope` para
 * que el handler reconstruya el TenantContext per-entry.
 */
@Controller('webhooks/wapi')
@SkipTenantScope()
export class WapiWebhookController {
  constructor(private readonly handler: WhatsAppWebhookHandler) {}

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  verify(
    @Param('slug') slug: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    return this.handler.verify(slug, mode, token, challenge);
  }

  @Post(':slug')
  @HttpCode(HttpStatus.OK)
  receive(
    @Param('slug') slug: string,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: true }> {
    return this.handler.receive(slug, signature, req.rawBody);
  }
}
