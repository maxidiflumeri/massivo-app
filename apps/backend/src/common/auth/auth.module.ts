import { Global, Module } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { AbilityFactory } from './ability.factory';
import { PoliciesGuard } from './policies.guard';

@Global()
@Module({
  providers: [
    ClerkAuthGuard,
    TenantContextGuard,
    TenantContextInterceptor,
    AbilityFactory,
    PoliciesGuard,
  ],
  exports: [
    ClerkAuthGuard,
    TenantContextGuard,
    TenantContextInterceptor,
    AbilityFactory,
    PoliciesGuard,
  ],
})
export class AuthModule {}
