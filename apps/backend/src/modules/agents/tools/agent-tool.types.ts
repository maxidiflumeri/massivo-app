import type { ToolDef } from '../model/model-types';

export type { ToolDef };

/** Contexto que recibe una tool al ejecutarse (ids del turno actual). */
export interface AgentToolContext {
  organizationId: string;
  teamId: string;
  conversationId: string;
  channelId: string;
  channelKind: string;
  externalUserId: string;
}

export interface AgentToolResult {
  /** Texto que se devuelve al modelo como `tool_result`. */
  content: string;
  /** Si true, el runtime corta el loop tras esta tool (no se usa para escalado, que
   *  deja que el modelo redacte un cierre). */
  stop?: boolean;
}

/** Una tool que el agente puede invocar. Built-in o (a futuro) custom del usuario. */
export interface AgentTool {
  readonly def: ToolDef;
  execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult>;
}
