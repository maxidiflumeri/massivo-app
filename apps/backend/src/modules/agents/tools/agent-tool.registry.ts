import { Injectable } from '@nestjs/common';
import { EscalateToOperatorTool } from './escalate-to-operator.tool';
import type { AgentTool, ToolDef } from './agent-tool.types';

/**
 * Registro de tools disponibles para los agentes. Slice 1: sólo built-ins
 * (`escalate_to_operator`). En slices siguientes se suman las tools custom del
 * usuario (HTTP, reusando el `BotHttpExecutor`) y el retrieval RAG.
 */
@Injectable()
export class AgentToolRegistry {
  private readonly tools: Map<string, AgentTool>;

  constructor(escalate: EscalateToOperatorTool) {
    this.tools = new Map<string, AgentTool>([[escalate.def.name, escalate]]);
  }

  /** Definiciones que se le pasan al modelo. */
  defs(): ToolDef[] {
    return [...this.tools.values()].map((t) => t.def);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }
}
