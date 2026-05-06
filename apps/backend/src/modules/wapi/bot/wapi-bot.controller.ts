import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiBotService } from './wapi-bot.service';
import { UpdateBotConfigDto } from './wapi-bot.dto';
import { WapiBotFeatureGuard } from './wapi-bot-feature.service';
import type { AppAbility } from '@massivo/permissions';

const BOT_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Endpoints del bot guiado por config (4.N + 4.N.2). Reusa permisos de
 * `WapiConfig` (read/update) — no creamos un nuevo subject CASL para no
 * proliferar.
 */
@Controller('wapi/configs/:id/bot')
@UseGuards(ClerkAuthGuard, TenantContextGuard, WapiBotFeatureGuard, PoliciesGuard)
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

  /**
   * Upload de un archivo para usar como nodo MEDIA del flow (4.N.2). Devuelve
   * el `mediaId` que el editor debe persistir en el nodo. No envía mensaje.
   */
  @Post('media')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: BOT_MEDIA_MAX_BYTES } }))
  uploadMedia(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Falta el archivo (campo "file" multipart)');
    }
    return this.service.uploadFlowMedia(id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    });
  }
}
