import {
  Body,
  Controller,
  Get,
  Param,
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
import { Audit } from '../../common/audit/audit.decorator';
import { ContactImportsService } from './contact-imports.service';
import {
  CreateContactImportDto,
  ListContactImportsQueryDto,
} from './contact-imports.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('contacts/imports')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ContactImportsController {
  constructor(private readonly service: ContactImportsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'ContactImportJob'))
  list(@Query() query: ListContactImportsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'ContactImportJob'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'ContactImportJob'))
  @Audit({
    action: 'contact.import.created',
    resourceType: 'ContactImportJob',
    resourceIdFrom: 'response:id',
    includeBody: false,
  })
  create(@Body() dto: CreateContactImportDto) {
    return this.service.create(dto);
  }
}
