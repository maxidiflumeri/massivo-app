import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { Audit } from '../../common/audit/audit.decorator';
import { DevSimulatorEnabledGuard } from './dev-simulator.controller';
import { InstagramSimulatorService } from './instagram-simulator.service';

export class EnsureInstagramChannelDto {
  @IsOptional() @IsString() @MaxLength(100)
  pageId?: string;

  @IsOptional() @IsString()
  botId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  name?: string;
}

export class SimulateInstagramInboundDto {
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
 * Fase 3 — Endpoints dev para probar Instagram end-to-end sin Meta:
 *  - POST /api/dev/channels/instagram/ensure  → crea/devuelve un Channel test (+bot)
 *  - POST /api/dev/channels/instagram/inbound → simula un inbound (texto/quick reply)
 * Gateados por `ENABLE_DEV_SIMULATOR=true`. El campo `psid` es el id del cliente
 * virtual (IGSID en IG); se mantiene el nombre para un solo camino de código.
 */
@Controller('dev/channels/instagram')
@UseGuards(DevSimulatorEnabledGuard, ClerkAuthGuard, TenantContextGuard)
@UseInterceptors(TenantContextInterceptor)
export class InstagramSimulatorController {
  constructor(private readonly service: InstagramSimulatorService) {}

  @Post('ensure')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'instagram.simulator.ensureChannel', resourceType: 'Channel' })
  ensure(@Body() dto: EnsureInstagramChannelDto) {
    return this.service.ensureTestChannel(dto);
  }

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'instagram.simulator.inbound', resourceType: 'Channel' })
  inbound(@Body() dto: SimulateInstagramInboundDto) {
    return this.service.simulateInbound(dto);
  }
}
