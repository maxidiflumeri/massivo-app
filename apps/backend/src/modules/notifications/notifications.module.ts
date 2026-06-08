import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Notificaciones del inbox (campanita del navbar). `NotificationsService` se
 * exporta para que los triggers lo inyecten: el webhook de WhatsApp y el ingest
 * agnóstico (mensajes nuevos), las acciones del inbox (assign/resolve/read) y los
 * escalados del bot. Sólo depende de `EventsModule` (+ Prisma global) → ningún
 * módulo de dominio entra acá, así que importarlo desde Wapi/Channels/Inbox no
 * crea ciclo.
 */
@Module({
  imports: [EventsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
