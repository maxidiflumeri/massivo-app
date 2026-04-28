import { Global, Module } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Global()
@Module({
  providers: [ClerkAuthGuard, TenantContextGuard, TenantContextInterceptor],
  exports: [ClerkAuthGuard, TenantContextGuard, TenantContextInterceptor],
})
export class AuthModule {}
