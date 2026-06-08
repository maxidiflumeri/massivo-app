import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Módulo global: `RedisService` queda inyectable en toda la app sin reimportar
 * (lo usan el sandbox del bot y el adapter de socket.io para multi-instancia).
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
