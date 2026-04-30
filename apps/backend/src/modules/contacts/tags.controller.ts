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
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './contacts.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('tags')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Tag'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Tag'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Tag'))
  create(@Body() dto: CreateTagDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Tag'))
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Tag'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
