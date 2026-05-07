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
import { Audit } from '../../common/audit/audit.decorator';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './email-templates.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('email/templates')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Template'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Template'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Template'))
  @Audit({ action: 'email.template.created', resourceType: 'EmailTemplate', resourceIdFrom: 'response:id', includeBody: false })
  create(@Body() dto: CreateEmailTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Template'))
  @Audit({ action: 'email.template.updated', resourceType: 'EmailTemplate', resourceIdFrom: 'param:id', includeBody: false })
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Template'))
  @Audit({ action: 'email.template.deleted', resourceType: 'EmailTemplate', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
