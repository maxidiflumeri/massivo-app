import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/logger/winston.config';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { MeModule } from './modules/me/me.module';
import { TeamsModule } from './modules/teams/teams.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.local', '../../.env'],
    }),
    WinstonModule.forRoot(winstonConfig),
    TerminusModule,
    PrismaModule,
    AuthModule,
    WebhooksModule,
    MeModule,
    TeamsModule,
    EmailModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}

