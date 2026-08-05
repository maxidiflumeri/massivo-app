import { Global, Module } from '@nestjs/common';
import { ConversationEpisodeService } from './conversation-episode.service';

/**
 * Monitoreo — provee `ConversationEpisodeService` globalmente: lo necesitan los
 * 6 lugares que escriben mensajes (webhook, ingest, bot, inbox, agente), que
 * viven en módulos distintos.
 */
@Global()
@Module({
  providers: [ConversationEpisodeService],
  exports: [ConversationEpisodeService],
})
export class EpisodesModule {}
