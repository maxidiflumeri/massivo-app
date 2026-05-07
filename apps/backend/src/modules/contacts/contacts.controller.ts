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
import { Audit } from '../../common/audit/audit.decorator';
import { ContactsService } from './contacts.service';
import { ContactTimelineService } from './contact-timeline.service';
import {
  CreateContactDto,
  FindByIdentityQueryDto,
  ListContactsQueryDto,
  UpdateContactDto,
} from './contacts.dto';
import { GetTimelineQueryDto } from './contact-timeline.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('contacts')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ContactsController {
  constructor(
    private readonly service: ContactsService,
    private readonly timeline: ContactTimelineService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  list(@Query() query: ListContactsQueryDto) {
    return this.service.list(query);
  }

  @Get('by-identity')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  findByIdentity(@Query() query: FindByIdentityQueryDto) {
    return this.service.findByIdentity(query);
  }

  @Get(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/timeline')
  @CheckPolicies((ability: AppAbility) => ability.can('read', 'Contact'))
  getTimeline(@Param('id') id: string, @Query() query: GetTimelineQueryDto) {
    return this.timeline.getTimeline(id, query);
  }

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Contact'))
  @Audit({ action: 'contact.created', resourceType: 'Contact', resourceIdFrom: 'response:id' })
  create(@Body() dto: CreateContactDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Contact'))
  @Audit({ action: 'contact.updated', resourceType: 'Contact', resourceIdFrom: 'param:id' })
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability: AppAbility) => ability.can('delete', 'Contact'))
  @Audit({ action: 'contact.deleted', resourceType: 'Contact', resourceIdFrom: 'param:id' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
