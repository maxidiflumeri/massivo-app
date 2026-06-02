import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ObservabilityContext } from './observability-context';

/**
 * 4.R — Genera un traceId al inicio de cada HTTP request y abre el scope
 * de ObservabilityContext para todo el lifecycle del request. Todos los
 * services que llamen a EventLogger.* dentro de ese request van a salir
 * con el mismo traceId.
 *
 * Se monta con `consumer.apply(...).forRoutes('*')` en AppModule.configure.
 */
@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Respetamos x-trace-id si ya viene del cliente / load balancer / SSM
    // (útil para correlar logs entre frontend y backend cuando hace falta).
    const incoming = (req.headers['x-trace-id'] as string | undefined)?.trim();
    const traceId = incoming && incoming.length <= 32 ? incoming : ObservabilityContext.newTraceId();
    ObservabilityContext.run({ traceId }, () => next());
  }
}
