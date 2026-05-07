import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { Audit } from '../../common/audit/audit.decorator';
import { MEDIA_LIMITS_BY_TYPE } from '../wapi/media/wapi-media.types';
import { DevSimulatorService } from './dev-simulator.service';
import {
  SimulateInboundButtonDto,
  SimulateInboundMediaDto,
  SimulateInboundReactionDto,
  SimulateInboundTextDto,
  SimulateStatusDto,
} from './dev-simulator.dto';

const MAX_UPLOAD_BYTES = Math.max(...Object.values(MEDIA_LIMITS_BY_TYPE));

/**
 * Guard que devuelve 404 si `ENABLE_DEV_SIMULATOR !== 'true'`. Usamos 404 en
 * vez de 403 para que el endpoint sea indistinguible de "no existe" en prod.
 */
@Injectable()
export class DevSimulatorEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(_ctx: ExecutionContext): boolean {
    const enabled = this.config.get<string>('ENABLE_DEV_SIMULATOR') === 'true';
    if (!enabled) throw new NotFoundException();
    return true;
  }
}

@Controller('dev/wapi/simulate')
@UseGuards(DevSimulatorEnabledGuard, ClerkAuthGuard, TenantContextGuard)
@UseInterceptors(TenantContextInterceptor)
export class DevSimulatorController {
  constructor(private readonly service: DevSimulatorService) {}

  @Post('inbound/text')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'wapi.simulator.inbound.text', resourceType: 'WapiSimulator' })
  inboundText(@Body() dto: SimulateInboundTextDto) {
    return this.service.simulateInboundText(dto);
  }

  @Post('inbound/media')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @Audit({ action: 'wapi.simulator.inbound.media', resourceType: 'WapiSimulator', includeBody: false })
  inboundMedia(
    @Body() dto: SimulateInboundMediaDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Falta el archivo (campo "file" multipart)');
    }
    return this.service.simulateInboundMedia(dto, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    });
  }

  @Post('inbound/reaction')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'wapi.simulator.inbound.reaction', resourceType: 'WapiSimulator' })
  inboundReaction(@Body() dto: SimulateInboundReactionDto) {
    return this.service.simulateInboundReaction(dto);
  }

  @Post('inbound/button')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'wapi.simulator.inbound.button', resourceType: 'WapiSimulator' })
  inboundButton(@Body() dto: SimulateInboundButtonDto) {
    return this.service.simulateInboundButton(dto);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'wapi.simulator.status', resourceType: 'WapiSimulator' })
  status(@Body() dto: SimulateStatusDto) {
    return this.service.simulateStatus(dto);
  }
}
