import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { RedisService } from './common/redis/redis.service';
import { RedisIoAdapter } from './common/redis/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Adapter Redis de socket.io: imprescindible para escalar horizontal — propaga
  // los emits (inbox en vivo, notificaciones, webchat) entre todas las instancias.
  const redisIoAdapter = new RedisIoAdapter(app, app.get(RedisService));
  redisIoAdapter.connect();
  app.useWebSocketAdapter(redisIoAdapter);

  const config = app.get(ConfigService);
  const port = config.get<number>('BACKEND_PORT', 3001);
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(port);
}

void bootstrap();
