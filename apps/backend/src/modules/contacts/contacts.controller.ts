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
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './contacts.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('contacts')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  findAll(@Query('email') email?: string, @Query('phone') phone?: string) {
    if (email) return this.service.findByEmail(email);
    if (phone) return this.service.findByPhone(phone);
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Contact'))
  create(@Body() dto: CreateContactDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Contact'))
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Contact'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
