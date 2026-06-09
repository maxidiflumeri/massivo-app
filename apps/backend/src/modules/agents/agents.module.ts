import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentsController } from './agents.controller';
import { AgentDocumentsController } from './agent-documents.controller';
import { AgentsService } from './agents.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentDocumentService } from './rag/agent-document.service';
import { AgentRetrievalService } from './rag/agent-retrieval.service';
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
