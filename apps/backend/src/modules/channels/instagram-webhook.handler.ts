import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { ConversationIngestService } from './conversation-ingest.service';
import { MetaMessagingWebhookHandler } from './meta-messaging-webhook.handler';

/**
 * Fase 3 — Handler del webhook de Instagram Direct (`/api/channels/instagram/:slug`,
 * `object: 'instagram'`, Channel `kind=INSTAGRAM`). Idéntico a Messenger salvo el
 * kind/object; toda la lógica vive en `MetaMessagingWebhookHandler`.
 */
@Injectable()
export class InstagramWebhookHandler extends MetaMessagingWebhookHandler {
  constructor(
    prisma: PrismaService,
    encryption: EncryptionService,
    adapter: InstagramAdapter,
    ingest: ConversationIngestService,
  ) {
    super(prisma, encryption, ingest, adapter, 'INSTAGRAM', 'instagram');
  }
}
