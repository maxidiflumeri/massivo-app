import { Global, Module } from '@nestjs/common';
import { ClerkSyncService } from './clerk-sync.service';

/**
 * 4.R — Provee `ClerkSyncService` al webhook handler y a /me/context para
 * backfill on-demand de entidades faltantes. Global para evitar imports
 * cruzados entre módulos que ya tienen vidas diferentes.
 */
@Global()
@Module({
  providers: [ClerkSyncService],
  exports: [ClerkSyncService],
})
export class ClerkModule {}
