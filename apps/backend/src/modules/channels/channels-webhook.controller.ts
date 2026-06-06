import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  NotImplementedException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTenantScope } from '../../common/auth/skip-tenant-scope.decorator';
import { WhatsAppWebhookHandler } from '../wapi/webhook/whatsapp-webhook.handler';
import { MessengerWebhookHandler } from './messenger-webhook.handler';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import type { ChannelKind } from './adapter.types';

/**
 * 1c — Webhook **genérico multi-canal**: `/api/channels/:kind/:slug`.
 *
 * Resuelve el `kind` (whatsapp | instagram | messenger | webchat) y despacha al
 * handler del proveedor correspondiente. Hoy sólo WhatsApp tiene handler de
 * inbound; el resto llega con sus adapters en Fases 2-4. La ruta legacy
 * `/api/webhooks/wapi/:slug` (`WapiWebhookController`) sigue andando como alias
 * de la rama WhatsApp.
 *
 * Endpoint público (los proveedores no mandan auth) → `@SkipTenantScope`.
 */
@Controller('channels')
@SkipTenantScope()
export class ChannelsWebhookController {
  constructor(
    private readonly registry: ChannelAdapterRegistry,
    private readonly whatsapp: WhatsAppWebhookHandler,
    private readonly messenger: MessengerWebhookHandler,
  ) {}

  @Get(':kind/:slug')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Param('kind') kind: string,
    @Param('slug') slug: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    const resolved = this.resolveKind(kind);
    if (resolved === 'WHATSAPP') {
      return this.whatsapp.verify(slug, mode, token, challenge);
    }
    if (resolved === 'MESSENGER') {
      return this.messenger.verify(slug, mode, token, challenge);
    }
    throw new NotImplementedException(`Webhook inbound para ${resolved} aún no implementado`);
  }

  @Post(':kind/:slug')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('kind') kind: string,
    @Param('slug') slug: string,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: true }> {
    const resolved = this.resolveKind(kind);
    if (resolved === 'WHATSAPP') {
      return this.whatsapp.receive(slug, signature, req.rawBody);
    }
    if (resolved === 'MESSENGER') {
      return this.messenger.receive(slug, signature, req.rawBody);
    }
    throw new NotImplementedException(`Webhook inbound para ${resolved} aún no implementado`);
  }

  /** Normaliza `:kind` de la URL (lowercase) al `ChannelKind`; 404 si no hay
   *  adapter registrado para ese kind (slug opaco → no leakeamos qué existe). */
  private resolveKind(raw: string): ChannelKind {
    const kind = raw.toUpperCase() as ChannelKind;
    if (!this.registry.has(kind)) {
      throw new NotFoundException(`canal "${raw}" no soportado`);
    }
    return kind;
  }
}
