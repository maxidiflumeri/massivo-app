import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { InstagramAdapter } from '../channels/adapters/instagram.adapter';
import { ConversationIngestService } from '../channels/conversation-ingest.service';
import { MetaMessagingSimulatorService } from './meta-messaging-simulator.service';

/**
 * Fase 3 — Simulador de inbound de Instagram Direct para dev. Idéntico a Messenger
 * salvo el kind/object; toda la lógica vive en `MetaMessagingSimulatorService`.
 */
@Injectable()
export class InstagramSimulatorService extends MetaMessagingSimulatorService {
  constructor(
    prisma: PrismaService,
    encryption: EncryptionService,
    adapter: InstagramAdapter,
    ingest: ConversationIngestService,
  ) {
    super(prisma, encryption, ingest, adapter, 'INSTAGRAM', 'instagram', 'Instagram (test)', 'IG');
  }
}
