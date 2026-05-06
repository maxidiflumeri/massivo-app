import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiBotService } from './wapi-bot.service';
import { UpdateBotConfigDto } from './wapi-bot.dto';
import type { AppAbility } from '@massivo/permissions';

/**
 * Endpoints del bot guiado por config (4.M). Reusa permisos de `WapiConfig`
 * (read/update) — no creamos un nuevo subject CASL para no proliferar.
 */
@Controller('wapi/configs/:id/bot')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiBotController {
  constructor(private readonly service: WapiBotService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch()
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  update(@Param('id') id: string, @Body() dto: UpdateBotConfigDto) {
    return this.service.update(id, dto);
  }
}
