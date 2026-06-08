import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { NotificationsService } from './notifications.service';
import { MarkAllReadDto } from './notifications.dto';

/**
 * Campanita del navbar. Reusa el subject CASL `Conversation` (las notificaciones
 * son sobre conversaciones): `read` para listar, `update` para marcar leídas.
 */
@Controller('notifications')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  list() {
    return this.service.list();
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  markAllRead(@Body() dto: MarkAllReadDto) {
    return this.service.markAllRead(dto.bucket ?? 'all');
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }
}
