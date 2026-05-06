/**
 * Tipos espejados del backend (apps/backend/src/modules/wapi/bot/wapi-bot.types.ts).
 * Mantener sincronizado al cambiar el shape del flow.
 */
export const BOT_OPTION_PREFIX = 'bot:';

export type BotNodeKind = 'MENU' | 'MESSAGE' | 'HANDOFF';

export interface BotNodePosition {
  x: number;
  y: number;
}

export interface BotMenuOption {
  id: string;
  label: string;
  nextNodeId: string;
}

export interface BotMenuNode {
  kind: 'MENU';
  text: string;
  options: BotMenuOption[];
  header?: string;
  footer?: string;
  position?: BotNodePosition;
}

export interface BotMessageNode {
  kind: 'MESSAGE';
  text: string;
  /** Si está seteado, el motor avanza solo al siguiente nodo. Sin él, queda silencioso. */
  nextNodeId?: string;
  position?: BotNodePosition;
}

export interface BotHandoffNode {
  kind: 'HANDOFF';
  text: string;
  escalate?: boolean;
  position?: BotNodePosition;
}

export type BotNode = BotMenuNode | BotMessageNode | BotHandoffNode;

export interface BotFlow {
  startNodeId: string;
  nodes: Record<string, BotNode>;
}

export interface BotConfigSnapshot {
  configId: string;
  botEnabled: boolean;
  botSessionTtlMin: number;
  botFlow: BotFlow | null;
}

export interface UpdateBotPayload {
  botEnabled?: boolean;
  botSessionTtlMin?: number;
  botFlow?: BotFlow | null;
}
