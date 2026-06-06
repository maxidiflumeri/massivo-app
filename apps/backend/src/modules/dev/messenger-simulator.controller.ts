import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { Audit } from '../../common/audit/audit.decorator';
import { DevSimulatorEnabledGuard } from './dev-simulator.controller';
import { MessengerSimulatorService } from './messenger-simulator.service';

export class EnsureMessengerChannelDto {
  @IsOptional() @IsString() @MaxLength(100)
  pageId?: string;

  @IsOptional() @IsString()
  botId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  name?: string;
}

export class SimulateMessengerInboundDto {
  @IsString()
  channelId!: string;

  @IsString() @MaxLength(100)
  psid!: string;

  @IsOptional() @IsString() @MaxLength(4096)
  text?: string;

  @IsOptional() @IsString() @MaxLength(200)
  quickReplyPayload?: string;
}

/**
 * 4.L (extendido) — Endpoints dev para probar Messenger end-to-end sin Meta:
 *  - POST /api/dev/channels/messenger/ensure  → crea/devuelve un Channel test (+bot)
 *  - POST /api/dev/channels/messenger/inbound → simula un inbound (texto/quick reply)
 * Gateados por `ENABLE_DEV_SIMULATOR=true`.
 */
@Controller('dev/channels/messenger')
@UseGuards(DevSimulatorEnabledGuard, ClerkAuthGuard, TenantContextGuard)
@UseInterceptors(TenantContextInterceptor)
export class MessengerSimulatorController {
  constructor(private readonly service: MessengerSimulatorService) {}

  @Post('ensure')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'messenger.simulator.ensureChannel', resourceType: 'Channel' })
  ensure(@Body() dto: EnsureMessengerChannelDto) {
    return this.service.ensureTestChannel(dto);
  }

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'messenger.simulator.inbound', resourceType: 'Channel' })
  inbound(@Body() dto: SimulateMessengerInboundDto) {
    return this.service.simulateInbound(dto);
  }
}
