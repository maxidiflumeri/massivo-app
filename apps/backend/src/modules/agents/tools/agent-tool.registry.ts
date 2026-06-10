import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import { BotHttpExecutor } from '../../bot/bot-http-executor.service';
import { EscalateToOperatorTool } from './escalate-to-operator.tool';
import { HttpAgentTool, type AgentCustomToolRow } from './http-agent-tool';
import type { AgentTool, ToolDef } from './agent-tool.types';

/** Set de tools resuelto para UN agente: una foto consistente para todo el turno
 *  (defs y lookup salen del mismo Map — el loop nunca ve un set distinto). */
export interface ResolvedTools {
  defs: ToolDef[];
  get(name: string): AgentTool | undefined;
}

/** Nombres reservados: las custom no pueden pisarlos (validado en el CRUD;
 *  defensa extra acá — si colisionan, gana la built-in). */
export const BUILTIN_TOOL_NAMES = new Set(['escalate_to_operator']);

/**
 * Registro de tools disponibles para los agentes: built-ins (siempre presentes)
 * + las `AgentCustomTool` linkeadas al agente y enabled, envueltas en
 * `HttpAgentTool` por fila. Sin cache (v0): un findMany por turno es
 * despreciable frente a la llamada al LLM.
 */
@Injectable()
export class AgentToolRegistry {
  private readonly builtins: Map<string, AgentTool>;

  constructor(
    escalate: EscalateToOperatorTool,
    private readonly prisma: PrismaService,
    private readonly executor: BotHttpExecutor,
    private readonly encryption: EncryptionService,
  ) {
    this.builtins = new Map<string, AgentTool>([[escalate.def.name, escalate]]);
  }

  /** Tools efectivas de un agente. Cliente raíz (no scoped): el runtime corre
   *  fuera de un request HTTP (inbound de canal) y el lookup es por agentId. */
  async resolveForAgent(agentId: string): Promise<ResolvedTools> {
    const map = new Map<string, AgentTool>(this.builtins);

    const links = await this.prisma.agentCustomToolLink.findMany({
      where: { agentId, tool: { enabled: true } },
      include: { tool: true },
    });
    for (const link of links) {
      const row = link.tool as unknown as AgentCustomToolRow;
      if (BUILTIN_TOOL_NAMES.has(row.name)) continue; // built-ins ganan
      map.set(row.name, new HttpAgentTool(row, this.executor, this.encryption));
    }

    return {
      defs: [...map.values()].map((t) => t.def),
      get: (name: string) => map.get(name),
    };
  }
}
