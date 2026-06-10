import { Logger } from '@nestjs/common';
import type { BotHttpExecutor } from '../../bot/bot-http-executor.service';
import type { BotHttpMethod, BotHttpNode } from '../../bot/bot.types';
import type { EncryptionService } from '../../../common/security/encryption.service';
import type { AgentTool, AgentToolContext, AgentToolResult, ToolDef } from './agent-tool.types';

/** Tope de chars del resultado serializado que entra al contexto del modelo. */
export const TOOL_RESULT_MAX_CHARS = 8000;

/** Header de una tool custom tal como se persiste en `AgentCustomTool.headers`. */
export interface CustomToolHeader {
  key: string;
  /** Encriptado at-rest (AES-256-GCM) cuando `secret === true`. */
  value: string;
  secret?: boolean;
}

/** Subset de la fila `AgentCustomTool` que necesita el wrapper. */
export interface AgentCustomToolRow {
  id: string;
  name: string;
  description: string;
  parameters: unknown;
  method: string;
  url: string;
  headers: unknown;
  bodyTemplate: unknown;
  timeoutMs: number | null;
}

/**
 * Tool custom de tipo HTTP: envuelve una fila de `AgentCustomTool` e implementa
 * el contrato `AgentTool` del runtime. NO es Injectable — se instancia por fila
 * en `AgentToolRegistry.resolveForAgent()` (mismo patrón que `SmtpSender`).
 *
 * La ejecución delega en `BotHttpExecutor` (SSRF guard, anti DNS-rebinding,
 * timeout clamp, cap 1 MB, rate limit por org). Los args que decidió el modelo
 * viajan como `{ args }` en el BotData, así url/headers/body interpolan con
 * `{{args.x}}` / `{{= args.x }}`.
 *
 * El executor nunca tira excepción: ante `{ok:false}` devolvemos al modelo un
 * texto que lo instruye a avisar el fallo y seguir ayudando (sin stop: el loop
 * continúa y el modelo redacta la respuesta).
 */
export class HttpAgentTool implements AgentTool {
  private static readonly logger = new Logger(HttpAgentTool.name);

  readonly def: ToolDef;

  constructor(
    private readonly row: AgentCustomToolRow,
    private readonly executor: BotHttpExecutor,
    private readonly encryption: EncryptionService,
  ) {
    this.def = {
      name: row.name,
      description: row.description,
      parameters: (row.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    };
  }

  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    // Headers: desencriptar los secret recién acá (en el GET del CRUD van enmascarados).
    const headers: Record<string, string> = {};
    for (const h of (this.row.headers as CustomToolHeader[] | null) ?? []) {
      if (!h?.key) continue;
      try {
        headers[h.key] = h.secret ? this.encryption.decrypt(h.value) : h.value;
      } catch {
        HttpAgentTool.logger.warn(
          `header secreto indesencriptable tool=${this.row.id} key=${h.key} — se omite`,
        );
      }
    }

    const node: BotHttpNode = {
      kind: 'HTTP',
      method: this.row.method as BotHttpMethod,
      url: this.row.url,
      headers,
      body: this.row.bodyTemplate ?? undefined,
      timeoutMs: this.row.timeoutMs ?? undefined,
      // El executor no usa saveAs (es del engine del bot); requerido por el tipo.
      saveAs: 'result',
    };

    const result = await this.executor.execute(node, { args }, {
      mode: 'real',
      configId: 'agent-tool',
      nodeId: this.row.id,
      organizationId: ctx.organizationId,
      auditAction: 'agent.tool.http.executed',
      auditResourceType: 'AgentCustomTool',
    });

    if (!result.ok) {
      const detail = result.error ?? `HTTP ${result.status}`;
      return {
        content:
          `La herramienta falló (${detail}). Avisale al usuario que no pudiste ` +
          `consultarlo e intentá ayudarlo de otra forma.`,
      };
    }

    let content =
      typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? null);
    if (!content || content === 'null') content = '(respuesta vacía)';
    if (content.length > TOOL_RESULT_MAX_CHARS) {
      content = `${content.slice(0, TOOL_RESULT_MAX_CHARS)}… [truncado]`;
    }
    return { content };
  }
}
