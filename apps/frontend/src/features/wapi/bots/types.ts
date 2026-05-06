/**
 * Tipos espejados del backend (apps/backend/src/modules/wapi/bot/wapi-bot.types.ts).
 * Mantener sincronizado al cambiar el shape del flow.
 */
export const BOT_OPTION_PREFIX = 'bot:';

export type BotNodeKind =
  | 'MENU'
  | 'MESSAGE'
  | 'HANDOFF'
  | 'CAPTURE'
  | 'MEDIA'
  | 'CONDITION'
  | 'SET_VAR';

export interface BotNodePosition {
  x: number;
  y: number;
}

export interface BotMenuOption {
  id: string;
  label: string;
  nextNodeId: string;
  /** 4.O.1 — alternativa a nextNodeId: salta al startNodeId del topic destino. */
  gotoTopic?: string;
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
  /** 4.O.1 — alternativa a nextNodeId: salta al startNodeId del topic destino. */
  gotoTopic?: string;
  position?: BotNodePosition;
}

export interface BotHandoffNode {
  kind: 'HANDOFF';
  text: string;
  escalate?: boolean;
  position?: BotNodePosition;
}

// 4.N.2 — CAPTURE
export type BotCaptureValidatePreset = 'email' | 'phone' | 'number' | 'any';
export type BotCaptureValidate =
  | { kind: 'regex'; pattern: string }
  | { kind: 'preset'; preset: BotCaptureValidatePreset };

export interface BotCaptureNode {
  kind: 'CAPTURE';
  text: string;
  saveAs: string;
  validate?: BotCaptureValidate;
  /** Puede omitirse si se usa gotoTopic. */
  nextNodeId?: string;
  retryNodeId?: string;
  /** 4.O.1 — alternativa a nextNodeId: salta al startNodeId del topic destino. */
  gotoTopic?: string;
  position?: BotNodePosition;
}

// 4.N.2 — MEDIA
export type BotMediaKind = 'image' | 'video' | 'document' | 'audio';

export interface BotMediaNode {
  kind: 'MEDIA';
  mediaType: BotMediaKind;
  mediaId: string;
  caption?: string;
  filename?: string;
  nextNodeId?: string;
  /** 4.O.1 — alternativa a nextNodeId: salta al startNodeId del topic destino. */
  gotoTopic?: string;
  position?: BotNodePosition;
  /** Metadata del binario subido — el motor las copia al WapiMessage. */
  mediaLocalPath?: string;
  mediaSha256?: string;
  mediaMime?: string;
  mediaSize?: number;
}

// 4.N.2 — CONDITION
export type BotConditionVarOp = 'eq' | 'neq' | 'contains' | 'matches';

export type BotConditionWhen =
  | { kind: 'var'; var: string; op: BotConditionVarOp; value: string }
  | { kind: 'time'; between: [string, string] }
  | { kind: 'weekday'; days: number[] };

export interface BotConditionBranch {
  id: string;
  when: BotConditionWhen;
  nextNodeId?: string;
  /** 4.O.1 — alternativa a nextNodeId. */
  gotoTopic?: string;
}

export interface BotConditionNode {
  kind: 'CONDITION';
  branches: BotConditionBranch[];
  elseNextNodeId?: string;
  /** 4.O.1 — alternativa a elseNextNodeId. */
  elseGotoTopic?: string;
  position?: BotNodePosition;
}

/**
 * 4.O.5 — SET_VAR: nodo interno (no envía mensaje al usuario). Asigna `value` a
 * `session.data[varName]` y avanza al `nextNodeId` (o `gotoTopic`). El motor
 * coerce al tipo declarado en `botVariables` si la variable está declarada.
 * Strings se interpolan con `{{otraVar}}` antes de asignar.
 */
export interface BotSetVarNode {
  kind: 'SET_VAR';
  varName: string;
  value: string | number | boolean;
  nextNodeId?: string;
  gotoTopic?: string;
  position?: BotNodePosition;
}

export type BotNode =
  | BotMenuNode
  | BotMessageNode
  | BotHandoffNode
  | BotCaptureNode
  | BotMediaNode
  | BotConditionNode
  | BotSetVarNode;

export interface BotFlow {
  startNodeId: string;
  nodes: Record<string, BotNode>;
}

// =====================================================================
// 4.O.1 — Multi-tema + router (mirror del backend)
// =====================================================================

export interface BotTopic {
  id: string;
  label: string;
  flow: BotFlow;
}

export type BotRouterRule =
  | {
      kind: 'template-payload';
      /** Patrón regex aplicado al payload. Soporta named groups (?<varName>...). */
      pattern: string;
      topicId: string;
    }
  | {
      kind: 'keyword';
      keywords: string[];
      topicId: string;
    }
  | {
      kind: 'default';
      topicId: string;
    };

export type BotRouterRuleKind = BotRouterRule['kind'];

export interface BotRouter {
  rules: BotRouterRule[];
  defaultTopicId?: string;
}

// =====================================================================
// 4.O.4 — Variables declarativas (mirror del backend)
// =====================================================================

export type BotVariableType = 'string' | 'number' | 'boolean';

export interface BotVariable {
  name: string;
  type: BotVariableType;
  description?: string;
  defaultValue?: string | number | boolean;
}

export interface BotConfigSnapshot {
  configId: string;
  botEnabled: boolean;
  botSessionTtlMin: number;
  /** Legacy: flow único (4.N). Si se persisten topics, este queda obsoleto. */
  botFlow: BotFlow | null;
  botTopics: BotTopic[] | null;
  botRouter: BotRouter | null;
  botVariables: BotVariable[] | null;
  /** 4.O.3 — borrador. null si no hay cambios sin publicar. */
  botTopicsDraft: BotTopic[] | null;
  botRouterDraft: BotRouter | null;
  botVariablesDraft: BotVariable[] | null;
  botDraftUpdatedAt: string | null;
  botPublishedAt: string | null;
  hasUnpublishedChanges: boolean;
}

export interface UpdateBotPayload {
  botEnabled?: boolean;
  botSessionTtlMin?: number;
  botFlow?: BotFlow | null;
  botTopics?: BotTopic[] | null;
  botRouter?: BotRouter | null;
  botVariables?: BotVariable[] | null;
}

export interface SaveBotDraftPayload {
  botTopics?: BotTopic[] | null;
  botRouter?: BotRouter | null;
  botVariables?: BotVariable[] | null;
}

// 4.O.3 — Sandbox
export type SandboxSource = 'draft' | 'published';

export type SandboxInbound =
  | { kind: 'text'; body: string }
  | { kind: 'button'; buttonId: string }
  | { kind: 'template-payload'; payload: string };

export interface SandboxStepRequest {
  phone: string;
  reset?: boolean;
  resetOnly?: boolean;
  source?: SandboxSource;
  inbound?: SandboxInbound;
}

export interface SandboxOutMessage {
  id: string;
  nodeId: string;
  topicId: string;
  type: 'text' | 'interactive' | 'image' | 'video' | 'audio' | 'document' | 'sticker';
  body: string;
  buttons?: { id: string; title: string }[];
  media?: {
    mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mediaId: string;
    mime?: string | null;
    filename?: string | null;
    localPath?: string | null;
  };
  handoff?: { escalate: boolean };
}

export interface SandboxStepResponse {
  messages: SandboxOutMessage[];
  session: {
    topicId: string;
    nodeId: string;
    data: Record<string, unknown>;
  } | null;
  unavailable?: boolean;
  errors?: { scope: string; path: string; message: string }[];
  sourceUsed: 'draft' | 'published' | 'none';
}

export interface BotMediaUploadResult {
  mediaId: string;
  mediaType: BotMediaKind;
  size: number;
  mime: string;
  localPath: string;
  sha256: string;
}
