import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import {
  AUDIT_METADATA_KEY,
  AuditOptions,
  AuditResourceIdSource,
} from './audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<AuditOptions | undefined>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!opts) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const metadata: Record<string, unknown> = {};
    if (opts.includeBody !== false && req.body && typeof req.body === 'object') {
      metadata.body = req.body;
    }
    if (req.params && Object.keys(req.params).length > 0) {
      metadata.params = req.params;
    }

    return next.handle().pipe(
      tap((response: unknown) => {
        const resourceId = resolveResourceId(opts.resourceIdFrom, req, response);
        void this.auditLog.log({
          action: opts.action,
          resourceType: opts.resourceType,
          resourceId,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
          ip: extractIp(req),
          userAgent: req.headers['user-agent'] ?? null,
        });
      }),
    );
  }
}

function resolveResourceId(
  source: AuditResourceIdSource | undefined,
  req: Request,
  response: unknown,
): string | null {
  if (!source) return null;
  const [kind, key] = source.split(':') as ['param' | 'body' | 'response', string];
  if (kind === 'param') {
    const v = (req.params as Record<string, unknown>)?.[key];
    return typeof v === 'string' ? v : null;
  }
  if (kind === 'body') {
    const v = (req.body as Record<string, unknown> | undefined)?.[key];
    return typeof v === 'string' ? v : null;
  }
  if (kind === 'response' && response && typeof response === 'object') {
    const v = (response as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0];
    return first ? first.trim() : null;
  }
  return req.ip ?? null;
}
