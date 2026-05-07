import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { OrganizationsService } from './organizations.service';
import type { AppAbility } from '@massivo/permissions';

/**
 * 4.P — endpoints sobre la organización actual ("me" en sentido org-scoped).
 * Mantenemos la convención `/orgs/me` para distinguir del módulo `/me` (user).
 */
@Controller('orgs/me')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('webhook-slug/regenerate')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability: AppAbility) => ability.can('update', 'Organization'))
  regenerateWebhookSlug() {
    return this.organizationsService.regenerateWebhookSlug();
  }
}
