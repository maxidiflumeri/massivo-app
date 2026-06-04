import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { Audit } from '../../../common/audit/audit.decorator';
import { WapiBotService } from './wapi-bot.service';
import { WapiBotSandboxService } from './wapi-bot-sandbox.service';
import { CreateBotDto, SandboxStepDto, SaveBotDraftDto, UpdateBotConfigDto } from './wapi-bot.dto';
import { WapiBotFeatureGuard } from './wapi-bot-feature.service';
import type { AppAbility } from '@massivo/permissions';

/**
 * Phase 0b (multi-canal) — API bot-centric. El bot se diseña una vez y se
 * conecta a N canales. Reusa los permisos CASL de `WapiConfig` (read/update)
 * para no proliferar subjects mientras el bot vive bajo el feature de WhatsApp.
 *
 * El upload de media de nodos sigue en `/wapi/configs/:id/media` — los mediaId
 * de Meta son por-WABA, así que se sube a través de un canal conectado.
 */
@Controller('bots')
@UseGuards(ClerkAuthGuard, TenantContextGuard, WapiBotFeatureGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class BotsController {
  constructor(
    private readonly service: WapiBotService,
    private readonly sandbox: WapiBotSandboxService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  list() {
    return this.service.listBots();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.created', resourceType: 'Bot', includeBody: true })
  create(@Body() dto: CreateBotDto) {
    return this.service.createBot(dto);
  }

  @Get(':botId')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  get(@Param('botId') botId: string) {
    return this.service.getBot(botId);
  }

  @Patch(':botId')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.updated', resourceType: 'Bot', resourceIdFrom: 'param:botId', includeBody: false })
  update(@Param('botId') botId: string, @Body() dto: UpdateBotConfigDto) {
    return this.service.updateBot(botId, dto);
  }

  @Patch(':botId/draft')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.draftSaved', resourceType: 'Bot', resourceIdFrom: 'param:botId', includeBody: false })
  saveDraft(@Param('botId') botId: string, @Body() dto: SaveBotDraftDto) {
    return this.service.saveDraftBot(botId, dto);
  }

  @Post(':botId/publish')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.published', resourceType: 'Bot', resourceIdFrom: 'param:botId' })
  publish(@Param('botId') botId: string) {
    return this.service.publishBot(botId);
  }

  @Post(':botId/discard-draft')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.draftDiscarded', resourceType: 'Bot', resourceIdFrom: 'param:botId' })
  discardDraft(@Param('botId') botId: string) {
    return this.service.discardDraftBot(botId);
  }

  @Delete(':botId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.deleted', resourceType: 'Bot', resourceIdFrom: 'param:botId' })
  async remove(@Param('botId') botId: string) {
    await this.service.deleteBot(botId);
  }

  @Post(':botId/sandbox/step')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  sandboxStep(@Param('botId') botId: string, @Body() dto: SandboxStepDto) {
    return this.sandbox.stepByBot(botId, {
      phone: dto.phone,
      reset: dto.reset,
      resetOnly: dto.resetOnly,
      source: dto.source,
      httpMode: dto.httpMode,
      inbound: dto.inbound,
    });
  }

  /** Conecta un canal (WapiConfig) a este bot. */
  @Put(':botId/channels/:configId')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.channelConnected', resourceType: 'WapiConfig', resourceIdFrom: 'param:configId' })
  connect(@Param('botId') botId: string, @Param('configId') configId: string) {
    return this.service.setConfigBot(configId, botId);
  }

  /** Desconecta un canal de este bot (deja `WapiConfig.botId = null`). */
  @Delete(':botId/channels/:configId')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @Audit({ action: 'bot.channelDisconnected', resourceType: 'WapiConfig', resourceIdFrom: 'param:configId' })
  disconnect(@Param('configId') configId: string) {
    return this.service.setConfigBot(configId, null);
  }
}
