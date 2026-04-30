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
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { WapiTemplatesService } from './wapi-templates.service';
import { CreateWapiTemplateDto, UpdateWapiTemplateDto } from './wapi-templates.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('wapi/templates')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiTemplatesController {
  constructor(private readonly service: WapiTemplatesService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiTemplate'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiTemplate'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiTemplate'))
  create(@Body() dto: CreateWapiTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiTemplate'))
  update(@Param('id') id: string, @Body() dto: UpdateWapiTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'WapiTemplate'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
