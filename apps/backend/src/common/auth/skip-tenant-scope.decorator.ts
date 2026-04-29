import { SetMetadata } from '@nestjs/common';
import { SKIP_TENANT_SCOPE_KEY } from './tenant-context.guard';

export const SkipTenantScope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TENANT_SCOPE_KEY, true);
