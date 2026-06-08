import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { ModelGatewayService } from './model/model-gateway.service';
import { AnthropicModelProvider } from './model/anthropic.provider';
import { GeminiModelProvider, OpenAiModelProvider, OpenRouterModelProvider } from './model/openai.provider';
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
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentRuntimeService,
    ModelGatewayService,
    AnthropicModelProvider,
    OpenAiModelProvider,
    OpenRouterModelProvider,
    GeminiModelProvider,
    AgentToolRegistry,
    EscalateToOperatorTool,
  ],
  exports: [AgentRuntimeService],
})
export class AgentsModule {}
