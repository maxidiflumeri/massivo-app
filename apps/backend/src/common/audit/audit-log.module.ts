import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  providers: [
    AuditLogService,
    AuditInterceptor,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditLogService, AuditInterceptor],
})
export class AuditLogModule {}
