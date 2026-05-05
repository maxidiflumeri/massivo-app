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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiQuickRepliesService } from './wapi-quick-replies.service';
import {
  CreateWapiQuickReplyDto,
  UpdateWapiQuickReplyDto,
} from './wapi-quick-replies.dto';

@Controller('wapi/quick-replies')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiQuickRepliesController {
  constructor(private readonly service: WapiQuickRepliesService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'QuickReply'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'QuickReply'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((a: AppAbility) => a.can('create', 'QuickReply'))
  create(@Body() dto: CreateWapiQuickReplyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((a: AppAbility) => a.can('update', 'QuickReply'))
  update(@Param('id') id: string, @Body() dto: UpdateWapiQuickReplyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((a: AppAbility) => a.can('delete', 'QuickReply'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
