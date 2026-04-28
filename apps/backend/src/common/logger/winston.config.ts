import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

export const winstonConfig: winston.LoggerOptions = {
  level: logLevel,
  format: isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('Massivo', {
          colors: true,
          prettyPrint: true,
        }),
      ),
  transports: [new winston.transports.Console()],
};
