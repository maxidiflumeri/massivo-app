import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import { ObservabilityContext } from '../observability/observability-context';
import { TenantContext } from '../auth/tenant-context';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

/**
 * 4.R — Format que enriquece TODA línea Winston con los correlation IDs
 * del scope activo. Atrapa `this.logger.log(...)` de NestJS (que pasa por
 * nest-winston), llamadas directas a winston.* y los eventos del EventLogger
 * — todo sale con los mismos campos sin que cada caller los repita.
 *
 * Se aplica antes del format final (json en prod / nestLike en dev) para que
 * los IDs queden serializados igual que el resto de la metadata.
 *
 * No pisa fields que ya vengan en el log (EventLogger los emite explícitos
 * para el caso de overrides — ej: phone distinto del scope, traceId
 * propagado desde upstream).
 */
const observabilityFormat = winston.format((info) => {
  const obs = ObservabilityContext.current();
  for (const [key, value] of Object.entries(obs)) {
    if (value !== undefined && info[key] === undefined) {
      (info as Record<string, unknown>)[key] = value;
    }
  }
  const tenant = TenantContext.current();
  if (tenant) {
    if (info.organizationId === undefined) {
      (info as Record<string, unknown>).organizationId = tenant.organizationId;
    }
    if (info.teamId === undefined) {
      (info as Record<string, unknown>).teamId = tenant.teamId;
    }
    if (info.userId === undefined) {
      (info as Record<string, unknown>).userId = tenant.userId;
    }
  }
  return info;
});

export const winstonConfig: winston.LoggerOptions = {
  level: logLevel,
  format: isProduction
    ? winston.format.combine(
        observabilityFormat(),
        winston.format.timestamp(),
        winston.format.json(),
      )
    : winston.format.combine(
        observabilityFormat(),
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('Massivo', {
          colors: true,
          prettyPrint: true,
        }),
      ),
  transports: [new winston.transports.Console()],
};
