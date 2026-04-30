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
import { WapiConfigsService } from './wapi-configs.service';
import { CreateWapiConfigDto, UpdateWapiConfigDto } from './wapi-configs.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('wapi/configs')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiConfigsController {
  constructor(private readonly service: WapiConfigsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'WapiConfig'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'WapiConfig'))
  create(@Body() dto: CreateWapiConfigDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'WapiConfig'))
  update(@Param('id') id: string, @Body() dto: UpdateWapiConfigDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'WapiConfig'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
