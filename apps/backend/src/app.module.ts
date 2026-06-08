import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/logger/winston.config';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { ClerkModule } from './common/clerk/clerk.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { ObservabilityMiddleware } from './common/observability/observability.middleware';
import { AuthModule } from './common/auth/auth.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { SecurityModule } from './common/security/security.module';
import { QuotaModule } from './common/quota/quota.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { MeModule } from './modules/me/me.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlansModule } from './modules/plans/plans.module';
import { TeamsModule } from './modules/teams/teams.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { EmailModule } from './modules/email/email.module';
import { WapiModule } from './modules/wapi/wapi.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AgentsModule } from './modules/agents/agents.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { EventsModule } from './modules/events/events.module';
import { DevModule } from './modules/dev/dev.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.local', '../../.env'],
    }),
    WinstonModule.forRoot(winstonConfig),
    TerminusModule,
    PrismaModule,
    RedisModule,
    ObservabilityModule,
    ClerkModule,
    AuthModule,
    AuditLogModule,
    SecurityModule,
    QuotaModule,
    WebhooksModule,
    MeModule,
    OrganizationsModule,
    PlansModule,
    TeamsModule,
    AuditLogsModule,
    EmailModule,
    WapiModule,
    InboxModule,
    ChannelsModule,
    NotificationsModule,
    AgentsModule,
    ContactsModule,
    EventsModule,
    DevModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule implements NestModule {
  // 4.R — Middleware global para abrir un scope de ObservabilityContext con
  // traceId en cada HTTP request. Todos los logs emitidos vía EventLogger
  // dentro del request comparten el mismo traceId automáticamente.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ObservabilityMiddleware).forRoutes('*');
  }
}

