import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WapiModule } from '../wapi/wapi.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentsController } from './agents.controller';
import { AgentDocumentsController } from './agent-documents.controller';
import { AgentsService } from './agents.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentDocumentService } from './rag/agent-document.service';
import { AgentRetrievalService } from './rag/agent-retrieval.service';
import { EMBEDDING_DIM, EMBEDDING_PROVIDER, type EmbeddingProvider } from './rag/embedding-provider';
import { VoyageEmbeddingProvider } from './rag/voyage-embedding.provider';
import { ModelGatewayService } from './model/model-gateway.service';
import { AnthropicModelProvider } from './model/anthropic.provider';
import {
  GeminiModelProvider,
  GroqModelProvider,
  OpenAiModelProvider,
  OpenRouterModelProvider,
} from './model/openai.provider';
import { AgentToolRegistry } from './tools/agent-tool.registry';
import { EscalateToOperatorTool } from './tools/escalate-to-operator.tool';

/**
 * Plataforma agéntica (v0). Agentes IA de primera clase: CRUD + runtime LLM con
 * tool-calling. Importa `WapiModule` para reusar el `ChannelAdapterRegistry`
 * (enviar la respuesta por el canal), `EventsModule` (eventos del inbox) y
 * `NotificationsModule` (la tool de escalado notifica al equipo).
 *
 * Exporta `AgentRuntimeService` para que el ingest agnóstico (ChannelsModule) corra
 * el agente cuando el canal lo tiene conectado. (WhatsApp webhook + nodo AGENT del
 * bot llegan en el próximo slice, con forwardRef Wapi↔Agents.)
 */
@Module({
  imports: [WapiModule, EventsModule, NotificationsModule],
  controllers: [AgentsController, AgentDocumentsController],
  providers: [
    AgentsService,
    AgentRuntimeService,
    AgentDocumentService,
    AgentRetrievalService,
    VoyageEmbeddingProvider,
    {
      // Proveedor de embeddings activo, por env EMBEDDING_PROVIDER (default
      // "voyage"). Para sumar uno (ej. "local" con Transformers.js): implementar
      // EmbeddingProvider, registrarlo arriba y agregar el case acá.
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService, VoyageEmbeddingProvider],
      useFactory: (config: ConfigService, voyage: VoyageEmbeddingProvider): EmbeddingProvider => {
        const id = (config.get<string>('EMBEDDING_PROVIDER') ?? 'voyage').trim().toLowerCase();
        const providers: Record<string, EmbeddingProvider> = { [voyage.id]: voyage };
        const provider = providers[id];
        if (!provider) {
          throw new Error(
            `EMBEDDING_PROVIDER desconocido: "${id}" (soportados: ${Object.keys(providers).join(', ')})`,
          );
        }
        if (provider.dimension !== EMBEDDING_DIM) {
          throw new Error(
            `El proveedor de embeddings "${provider.id}" produce vectores de ${provider.dimension} dims pero la columna AgentChunk.embedding es vector(${EMBEDDING_DIM}) — requiere migración + re-embeber`,
          );
        }
        return provider;
      },
    },
    ModelGatewayService,
    AnthropicModelProvider,
    OpenAiModelProvider,
    OpenRouterModelProvider,
    GeminiModelProvider,
    GroqModelProvider,
    AgentToolRegistry,
    EscalateToOperatorTool,
  ],
  exports: [AgentRuntimeService],
})
export class AgentsModule {}
