import {
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
import { ContactMergeService } from './contact-merge.service';
import { ListMergeSuggestionsQueryDto } from './contact-merge.dto';
import type { AppAbility } from '@massivo/permissions';

@Controller('contacts/merge-suggestions')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ContactMergeController {
  constructor(private readonly service: ContactMergeService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) =>
    ability.can('read', 'ContactMergeSuggestion'),
  )
  list(@Query() query: ListMergeSuggestionsQueryDto) {
    return this.service.list(query);
  }

  @Post(':id/accept')
  @CheckPolicies((ability: AppAbility) =>
    ability.can('update', 'ContactMergeSuggestion'),
  )
  @Audit({
    action: 'contact.merge.accepted',
    resourceType: 'ContactMergeSuggestion',
    resourceIdFrom: 'param:id',
    includeBody: false,
  })
  accept(@Param('id') id: string) {
    return this.service.accept(id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability: AppAbility) =>
    ability.can('update', 'ContactMergeSuggestion'),
  )
  @Audit({
    action: 'contact.merge.rejected',
    resourceType: 'ContactMergeSuggestion',
    resourceIdFrom: 'param:id',
    includeBody: false,
  })
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }
}
