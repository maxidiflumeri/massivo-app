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
import { SmtpAccountsService } from './smtp-accounts.service';
import {
  CreateSmtpAccountDto,
  TestSmtpAccountDto,
  UpdateSmtpAccountDto,
} from './smtp-accounts.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('email/smtp-accounts')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SmtpAccountsController {
  constructor(private readonly service: SmtpAccountsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'SmtpAccount'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'SmtpAccount'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'SmtpAccount'))
  create(@Body() dto: CreateSmtpAccountDto) {
    return this.service.create(dto);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'SmtpAccount'))
  verify(@Param('id') id: string) {
    return this.service.verify(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'SmtpAccount'))
  testSend(@Param('id') id: string, @Body() dto: TestSmtpAccountDto) {
    return this.service.testSend(id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'SmtpAccount'))
  update(@Param('id') id: string, @Body() dto: UpdateSmtpAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'SmtpAccount'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
