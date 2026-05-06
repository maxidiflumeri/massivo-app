import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { interpolate } from './interpolate';
import {
  BOT_MAX_AUTO_CHAIN,
  BOT_OPTION_PREFIX,
  type BotMediaNode,
  type BotNode,
} from './wapi-bot.types';
import {
  applySetVar,
  DEFAULT_TOPIC_ID,
  handleCapture,
  pickConditionBranch,
  resolveTopics,
  type BotData,
  type ResolvedFlow,
} from './bot-flow-runtime';
import { WapiBotRouterService } from './wapi-bot-router.service';

/**
 * 4.O.3 — Sandbox del bot. Corre el flow `botTopicsDraft ?? botTopics ?? botFlow`
 * en memoria, sin tocar Meta ni la DB de sesiones/mensajes. Permite probar
 * cambios de un draft antes de publicarlos a producción.
 *
 * Multi-tenant safe: la WapiConfig se lee a través de `prisma.scoped` (filtra
 * por org+team del request), y la sesión sandbox se guarda con clave
 * `${orgId}:${configId}:${userId}:${phone}` para que dos orgs distintas que
 * usen el mismo phone numérico de prueba no compartan estado, y dos operadores
 * de la misma org pueden simular en paralelo sin colisionar.
 *
 * Reusa `bot-flow-runtime.ts` con el motor de prod — mismo handleCapture,
 * mismo pickConditionBranch, misma resolución de topics. La única diferencia
 * es que aquí "deliver" empuja a un array `outgoing` en vez de mandar a Meta
 * y persistir un WapiMessage.
 */

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS_PER_PROCESS = 10_000;

interface SandboxSessionState {
  currentTopicId: string;
  currentNodeId: string;
  data: BotData;
  lastUsedAt: number;
}

interface SandboxStore {
  sessions: Map<string, SandboxSessionState>;
}

export interface SandboxStepInput {
  /** Número simulado del cliente. Sólo se usa como key en la sesión sandbox — no se valida formato. */
  phone: string;
  /** Si true, descarta cualquier sesión previa antes de procesar el inbound. */
  reset?: boolean;
  /** Si true (y reset también), no procesa ningún inbound — sólo limpia. */
  resetOnly?: boolean;
  /**
   * Source del bot a ejecutar. `draft` = `botTopicsDraft ?? botTopics`.
   * `published` = `botTopics`. Default: `draft`.
   */
  source?: 'draft' | 'published';
  inbound?:
    | { kind: 'text'; body: string }
    | { kind: 'button'; buttonId: string }
    /**
     * 4.O.3 — Simula el payload de un botón de template de Meta. En prod este
     * inbound entra por `wapi-webhook.service` cuando el cliente clickea un
     * template button y la action es `BOT`; el payload pasa al router con
     * kind `template-payload` y los named groups del regex se inyectan como
     * seedData.
     */
    | { kind: 'template-payload'; payload: string };
}

/** Mensaje saliente del bot capturado por el sandbox (no se manda a Meta). */
export interface SandboxOutMessage {
  /** id sintético per-step, secuencial. El frontend lo usa como key de React. */
  id: string;
  nodeId: string;
  topicId: string;
  /** Tipo abstracto del mensaje (alineado con WapiMessage.type). */
  type: 'text' | 'interactive' | 'image' | 'video' | 'audio' | 'document' | 'sticker';
  /** Texto principal interpolado. Para MEDIA es la caption (puede estar vacío). */
  body: string;
  /** Para nodos MENU. */
  buttons?: { id: string; title: string }[];
  /** Para nodos MEDIA. */
  media?: {
    mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mediaId: string;
    mime?: string | null;
    filename?: string | null;
    localPath?: string | null;
  };
  /** True para HANDOFF — el frontend lo muestra como "fin de simulación". */
  handoff?: { escalate: boolean };
}

export interface SandboxStepResult {
  messages: SandboxOutMessage[];
  session: {
    topicId: string;
    nodeId: string;
    data: BotData;
  } | null;
  /** True si los topics/router/flow no se pudieron resolver (no hay nada que correr). */
  unavailable?: boolean;
  /** Errores de validación si la fuente seleccionada está rota. */
  errors?: { scope: string; path: string; message: string }[];
  /** Qué fuente se usó realmente (puede caer a published si no hay draft). */
  sourceUsed: 'draft' | 'published' | 'none';
}

interface CfgSnapshot {
  id: string;
  botFlow: unknown;
  botTopics: unknown;
  botRouter: unknown;
  botTopicsDraft: unknown;
  botRouterDraft: unknown;
  // 4.O.4 — variables declarativas (defaults aplicados al iniciar sesión).
  botVariables: unknown;
  botVariablesDraft: unknown;
}

@Injectable()
export class WapiBotSandboxService {
  private readonly logger = new Logger(WapiBotSandboxService.name);
  private readonly stores = new Map<string, SandboxStore>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: WapiBotRouterService,
  ) {}

  /**
   * Procesa un step del sandbox. La sesión vive en memoria por
   * (orgId, configId, userId, phone). TTL 30 min lazy.
   */
  async step(configId: string, input: SandboxStepInput): Promise<SandboxStepResult> {
    const ctx = TenantContext.current();
    if (!ctx) throw new NotFoundException('Sin contexto de tenant');

    const cfg = await this.loadConfig(configId);
    if (!cfg) throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);

    const source = input.source ?? 'draft';
    const { topicsRaw, routerRaw, variablesRaw, sourceUsed } = pickSource(cfg, source);
    const r = resolveTopics({
      topics: topicsRaw,
      router: routerRaw,
      flow: cfg.botFlow,
      variables: variablesRaw,
    });
    if (!r.resolved) {
      return {
        messages: [],
        session: null,
        unavailable: true,
        errors: r.errors,
        sourceUsed,
      };
    }

    const store = this.getStore(ctx.organizationId);
    this.cleanupIfNeeded(store);
    const key = sessionKey(ctx.organizationId, configId, ctx.userId, input.phone);

    if (input.reset) {
      store.sessions.delete(key);
      if (input.resetOnly) {
        return { messages: [], session: null, sourceUsed };
      }
    }

    if (!input.inbound) {
      // Ping: devolver estado actual sin procesar nada.
      const cur = store.sessions.get(key) ?? null;
      return {
        messages: [],
        session: cur ? { topicId: cur.currentTopicId, nodeId: cur.currentNodeId, data: cur.data } : null,
        sourceUsed,
      };
    }

    let session = store.sessions.get(key) ?? null;
    if (session && session.lastUsedAt + SESSION_TTL_MS < Date.now()) {
      store.sessions.delete(key);
      session = null;
    }

    const outgoing: SandboxOutMessage[] = [];
    let outSeq = 0;
    const emit = (node: BotNode, nodeId: string, topicId: string, data: BotData) => {
      const msg = buildOutMessage(`${Date.now()}-${outSeq++}`, node, nodeId, topicId, data);
      if (msg) outgoing.push(msg);
    };

    let data: BotData = session ? { ...session.data } : {};
    let currentTopicId: string = session?.currentTopicId ?? DEFAULT_TOPIC_ID;
    let currentTopic = r.resolved.topics.get(currentTopicId);
    if (!currentTopic) {
      currentTopic = r.resolved.topics.values().next().value;
      currentTopicId = currentTopic ? currentTopic.id : DEFAULT_TOPIC_ID;
    }
    if (!currentTopic) {
      return { messages: [], session: null, unavailable: true, sourceUsed };
    }

    let nextNodeId: string | null = null;
    let nextTopicId: string = currentTopicId;

    // 4.O.2 — match explícito del router interrumpe sesión (router-restart).
    if (input.inbound.kind === 'text') {
      const explicit = this.router.resolve(r.resolved.router, {
        kind: 'text',
        text: input.inbound.body,
      });
      if (explicit && (explicit.via === 'keyword' || explicit.via === 'template-payload')) {
        const t = r.resolved.topics.get(explicit.topicId);
        if (t) {
          session = null;
          data = { ...r.resolved.variableDefaults, ...explicit.seedData };
          nextTopicId = t.id;
          nextNodeId = t.flow.startNodeId;
        }
      }
    }

    // 4.O.3 — Inbound simulado de template-payload. En prod entra por el
    // webhook cuando el cliente clickea un botón de template con action BOT;
    // acá el operador del sandbox lo dispara explícitamente para probar las
    // rules `template-payload` sin necesitar un template real ni un device.
    // Siempre interrumpe la sesión activa (mismo "payload nuevo siempre gana"
    // que prod). Sin match → respuesta vacía + error explicativo.
    if (input.inbound.kind === 'template-payload') {
      const match = this.router.resolve(r.resolved.router, {
        kind: 'template-payload',
        payload: input.inbound.payload,
      });
      if (!match) {
        return {
          messages: [],
          session: null,
          sourceUsed,
          errors: [
            {
              scope: 'router',
              path: 'inbound.payload',
              message: `Ningún rule matchea el payload "${input.inbound.payload}"`,
            },
          ],
        };
      }
      const t = r.resolved.topics.get(match.topicId);
      if (!t) {
        return {
          messages: [],
          session: null,
          sourceUsed,
          errors: [
            {
              scope: 'router',
              path: 'inbound.payload',
              message: `Rule matcheó topic "${match.topicId}" pero no existe en este source`,
            },
          ],
        };
      }
      session = null;
      data = { ...r.resolved.variableDefaults, ...match.seedData };
      nextTopicId = t.id;
      nextNodeId = t.flow.startNodeId;
    }

    if (input.inbound.kind === 'button') {
      if (!input.inbound.buttonId.startsWith(BOT_OPTION_PREFIX)) {
        return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
      }
      if (!session) {
        return { messages: outgoing, session: null, sourceUsed };
      }
      const node = currentTopic.flow.nodes[session.currentNodeId];
      if (!node || node.kind !== 'MENU') {
        store.sessions.delete(key);
        return { messages: outgoing, session: null, sourceUsed };
      }
      const optionId = input.inbound.buttonId.slice(BOT_OPTION_PREFIX.length);
      const opt = node.options.find((o) => o.id === optionId);
      if (!opt) {
        // Re-emit the menu (option desconocida).
        emit(node, session.currentNodeId, currentTopicId, data);
        return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
      }
      const target = followGoto(opt.gotoTopic, opt.nextNodeId, currentTopicId, r.resolved);
      if (!target) {
        return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
      }
      nextNodeId = target.nodeId;
      nextTopicId = target.topicId;
    } else if (!nextNodeId && input.inbound.kind === 'text') {
      // Texto inbound sin router-restart aplicado.
      if (session) {
        const node = currentTopic.flow.nodes[session.currentNodeId];
        if (node && node.kind === 'CAPTURE') {
          const result = handleCapture(node, input.inbound.body, data);
          if (result.ok) {
            data = result.data;
            session.data = data;
            session.lastUsedAt = Date.now();
            const target = followGoto(node.gotoTopic, node.nextNodeId, currentTopicId, r.resolved);
            if (!target) {
              return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
            }
            nextNodeId = target.nodeId;
            nextTopicId = target.topicId;
          } else if (node.retryNodeId) {
            nextNodeId = node.retryNodeId;
          } else {
            emit(node, session.currentNodeId, currentTopicId, data);
            return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
          }
        } else if (node && node.kind === 'MENU') {
          emit(node, session.currentNodeId, currentTopicId, data);
          return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
        } else {
          // Sesión inválida — descartar y caer al ruteo de "sin sesión".
          store.sessions.delete(key);
          session = null;
          data = {};
        }
      }
      if (!nextNodeId && !session) {
        const match = this.router.resolve(r.resolved.router, {
          kind: 'text',
          text: input.inbound.body,
        });
        if (match) {
          const t = r.resolved.topics.get(match.topicId);
          if (t) {
            data = { ...r.resolved.variableDefaults, ...data, ...match.seedData };
            nextTopicId = t.id;
            nextNodeId = t.flow.startNodeId;
          }
        }
        if (!nextNodeId) {
          const def = r.resolved.topics.get(DEFAULT_TOPIC_ID);
          if (def) {
            data = { ...r.resolved.variableDefaults };
            nextTopicId = def.id;
            nextNodeId = def.flow.startNodeId;
          }
        }
      }
      if (!nextNodeId && session) {
        const t = r.resolved.topics.get(currentTopicId) ?? r.resolved.topics.get(DEFAULT_TOPIC_ID);
        if (t) {
          nextTopicId = t.id;
          nextNodeId = t.flow.startNodeId;
        }
      }
    }

    if (!nextNodeId) {
      return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
    }

    // Walk the chain, emitting messages.
    let topicId = nextTopicId;
    let topic = r.resolved.topics.get(topicId);
    if (!topic) {
      return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
    }
    let currentId: string | null = nextNodeId;
    let finalNode: BotNode | null = null;
    let finalId: string | null = null;
    let finalTopicId: string = topicId;
    for (let i = 0; i < BOT_MAX_AUTO_CHAIN; i++) {
      if (!currentId) break;
      const node: BotNode | undefined = topic.flow.nodes[currentId];
      if (!node) break;
      if (node.kind === 'CONDITION') {
        const target = pickConditionBranch(node, data);
        if (target?.gotoTopic) {
          const next = r.resolved.topics.get(target.gotoTopic);
          if (!next) break;
          topic = next;
          topicId = next.id;
          currentId = next.flow.startNodeId;
          continue;
        }
        currentId = target?.nextNodeId ?? null;
        if (!currentId) break;
        continue;
      }
      if (node.kind === 'SET_VAR') {
        data = applySetVar(node, data, r.resolved.variableTypes);
        if (node.gotoTopic) {
          const next = r.resolved.topics.get(node.gotoTopic);
          if (!next) break;
          topic = next;
          topicId = next.id;
          currentId = next.flow.startNodeId;
          continue;
        }
        currentId = node.nextNodeId ?? null;
        if (!currentId) break;
        continue;
      }
      emit(node, currentId, topicId, data);
      finalNode = node;
      finalId = currentId;
      finalTopicId = topicId;
      if ((node.kind === 'MESSAGE' || node.kind === 'MEDIA') && (node.nextNodeId || node.gotoTopic)) {
        if (node.gotoTopic) {
          const next = r.resolved.topics.get(node.gotoTopic);
          if (!next) break;
          topic = next;
          topicId = next.id;
          currentId = next.flow.startNodeId;
          continue;
        }
        currentId = node.nextNodeId ?? null;
        continue;
      }
      break;
    }

    if (!finalNode || !finalId) {
      return { messages: outgoing, session: this.snapshotSession(session), sourceUsed };
    }

    if (finalNode.kind === 'HANDOFF') {
      // Fin de la simulación. Borrar sesión.
      store.sessions.delete(key);
      return { messages: outgoing, session: null, sourceUsed };
    }

    // Persistir nueva sesión (MENU o CAPTURE — esperando próximo input).
    const nextSession: SandboxSessionState = {
      currentTopicId: finalTopicId,
      currentNodeId: finalId,
      data,
      lastUsedAt: Date.now(),
    };
    store.sessions.set(key, nextSession);
    return { messages: outgoing, session: this.snapshotSession(nextSession), sourceUsed };
  }

  /** Borra la sesión sandbox para (configId, userId, phone). */
  resetSession(configId: string, phone: string): void {
    const ctx = TenantContext.current();
    if (!ctx) return;
    const store = this.stores.get(ctx.organizationId);
    if (!store) return;
    store.sessions.delete(sessionKey(ctx.organizationId, configId, ctx.userId, phone));
  }

  private snapshotSession(s: SandboxSessionState | null): SandboxStepResult['session'] {
    if (!s) return null;
    return { topicId: s.currentTopicId, nodeId: s.currentNodeId, data: { ...s.data } };
  }

  private getStore(organizationId: string): SandboxStore {
    let store = this.stores.get(organizationId);
    if (!store) {
      store = { sessions: new Map() };
      this.stores.set(organizationId, store);
    }
    return store;
  }

  private cleanupIfNeeded(store: SandboxStore): void {
    if (store.sessions.size <= MAX_SESSIONS_PER_PROCESS) return;
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [k, v] of store.sessions) {
      if (v.lastUsedAt < cutoff) store.sessions.delete(k);
    }
  }

  private async loadConfig(configId: string): Promise<CfgSnapshot | null> {
    const row = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        botFlow: true,
        botTopics: true,
        botRouter: true,
        botTopicsDraft: true,
        botRouterDraft: true,
        botVariables: true,
        botVariablesDraft: true,
      } as never,
    });
    if (!row) return null;
    return row as unknown as CfgSnapshot;
  }
}

function sessionKey(orgId: string, configId: string, userId: string, phone: string): string {
  return `${orgId}:${configId}:${userId}:${phone}`;
}

function pickSource(
  cfg: CfgSnapshot,
  preference: 'draft' | 'published',
): {
  topicsRaw: unknown;
  routerRaw: unknown;
  variablesRaw: unknown;
  sourceUsed: 'draft' | 'published' | 'none';
} {
  if (preference === 'draft' && (cfg.botTopicsDraft || cfg.botRouterDraft)) {
    return {
      topicsRaw: cfg.botTopicsDraft ?? cfg.botTopics,
      routerRaw: cfg.botRouterDraft ?? cfg.botRouter,
      variablesRaw: cfg.botVariablesDraft ?? cfg.botVariables,
      sourceUsed: 'draft',
    };
  }
  if (cfg.botTopics) {
    return {
      topicsRaw: cfg.botTopics,
      routerRaw: cfg.botRouter,
      variablesRaw: cfg.botVariables,
      sourceUsed: 'published',
    };
  }
  if (cfg.botFlow) {
    return {
      topicsRaw: null,
      routerRaw: null,
      variablesRaw: cfg.botVariables,
      sourceUsed: 'published',
    };
  }
  return { topicsRaw: null, routerRaw: null, variablesRaw: null, sourceUsed: 'none' };
}

function followGoto(
  gotoTopic: string | undefined,
  nextNodeId: string | undefined,
  currentTopicId: string,
  resolved: ResolvedFlow,
): { topicId: string; nodeId: string } | null {
  if (gotoTopic) {
    const t = resolved.topics.get(gotoTopic);
    if (t) return { topicId: t.id, nodeId: t.flow.startNodeId };
  }
  if (nextNodeId) return { topicId: currentTopicId, nodeId: nextNodeId };
  return null;
}

function buildOutMessage(
  id: string,
  node: BotNode,
  nodeId: string,
  topicId: string,
  data: BotData,
): SandboxOutMessage | null {
  if (node.kind === 'CONDITION' || node.kind === 'SET_VAR') return null;
  if (node.kind === 'MENU') {
    return {
      id,
      nodeId,
      topicId,
      type: 'interactive',
      body: interpolate(node.text, data),
      buttons: node.options
        .slice(0, 3)
        .map((o) => ({ id: `${BOT_OPTION_PREFIX}${o.id}`, title: o.label })),
    };
  }
  if (node.kind === 'MEDIA') {
    return buildMediaOut(id, node, nodeId, topicId, data);
  }
  if (node.kind === 'HANDOFF') {
    return {
      id,
      nodeId,
      topicId,
      type: 'text',
      body: interpolate(node.text, data),
      handoff: { escalate: !!node.escalate },
    };
  }
  // MESSAGE | CAPTURE — texto plano interpolado.
  return {
    id,
    nodeId,
    topicId,
    type: 'text',
    body: interpolate(node.text, data),
  };
}

function buildMediaOut(
  id: string,
  node: BotMediaNode,
  nodeId: string,
  topicId: string,
  data: BotData,
): SandboxOutMessage {
  const caption = node.caption ? interpolate(node.caption, data) : '';
  return {
    id,
    nodeId,
    topicId,
    type: node.mediaType,
    body: caption,
    media: {
      mediaType: node.mediaType,
      mediaId: node.mediaId,
      mime: node.mediaMime ?? null,
      filename: node.filename ?? null,
      localPath: node.mediaLocalPath ?? null,
    },
  };
}
