import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // AWS SNS publica los POSTs al webhook de SES con Content-Type
  // "text/plain; charset=UTF-8" en lugar de application/json. El parser
  // default de Express no convierte text/plain a JSON, así que @Body()
  // queda undefined y devolvemos 400. Forzamos el parseo para esa ruta.
  app.use('/api/webhooks/ses', json({ type: '*/*', limit: '1mb' }));

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
