import { Global, Module } from '@nestjs/common';
import { AesGcmEncryptionService, EncryptionService } from './encryption.service';

/**
 * Modulo global de seguridad. Expone `EncryptionService` (abstract) ligado a la
 * impl actual (AES-256-GCM). El día que cambiemos a KMS, sólo cambia el provider
 * — los call sites siguen inyectando `EncryptionService`.
 */
@Global()
@Module({
  providers: [
    AesGcmEncryptionService,
    { provide: EncryptionService, useExisting: AesGcmEncryptionService },
  ],
  exports: [EncryptionService],
})
export class SecurityModule {}
