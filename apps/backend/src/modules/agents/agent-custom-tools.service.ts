import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/security/encryption.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { BUILTIN_TOOL_NAMES } from './tools/agent-tool.registry';
import { AGENT_TOOL_NAME_RE } from './agents.dto';
import type { AgentToolHeaderDto, CreateAgentToolDto, UpdateAgentToolDto } from './agents.dto';
import type { CustomToolHeader } from './tools/http-agent-tool';

/** Con qué se enmascaran los values secret en las respuestas del CRUD. */
export const SECRET_MASK = '••••';

export interface AgentToolDto {
  id: string;
  type: string;
  name: string;
  displayName: string;
  description: string;
  parameters: unknown;
  method: string;
  url: string;
  /** Values de headers secret enmascarados (nunca salen del backend). */
  headers: CustomToolHeader[];
  bodyTemplate: unknown;
  timeoutMs: number | null;
  enabled: boolean;
  /** Agentes que la usan (para la lista de la UI). */
  agentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const TOOL_INCLUDE = { agents: { select: { agentId: true } } } as const;

type ToolRow = {
  id: string;
  type: string;
  name: string;
  displayName: string;
  description: string;
  parameters: unknown;
  method: string;
  url: string;
  headers: unknown;
  bodyTemplate: unknown;
  timeoutMs: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  agents: { agentId: string }[];
};

/**
 * CRUD tenant-scoped de tools personalizadas + asignación m2m al agente.
 * Validaciones de UX acá (slug, colisión con built-ins, JSON Schema raíz,
 * método/URL); la validación fuerte de la request (SSRF, schemes, timeouts) la
 * hace `BotHttpExecutor` en runtime. Headers `secret` se encriptan at-rest y
 * salen siempre enmascarados; en updates, un value enmascarado significa
 * "conservar el secreto existente".
 */
@Injectable()
export class AgentCustomToolsService {
  private readonly logger = new Logger(AgentCustomToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private ctx() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('Sin contexto de tenant');
    return ctx;
  }

  async list(): Promise<AgentToolDto[]> {
    this.ctx();
    const rows = await this.prisma.scoped.agentCustomTool.findMany({
      orderBy: { createdAt: 'desc' },
      include: TOOL_INCLUDE,
    });
    return (rows as unknown as ToolRow[]).map((r) => this.toDto(r));
  }

  async get(id: string): Promise<AgentToolDto> {
    this.ctx();
    const row = await this.prisma.scoped.agentCustomTool.findFirst({
      where: { id },
      include: TOOL_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Tool ${id} no encontrada`);
    return this.toDto(row as unknown as ToolRow);
  }

  async create(dto: CreateAgentToolDto): Promise<AgentToolDto> {
    const ctx = this.ctx();
    this.validateName(dto.name);
    this.validateParameters(dto.parameters);
    this.validateUrl(dto.url);
    await this.assertNameFree(dto.name);

    const created = await this.prisma.scoped.agentCustomTool.create({
      data: {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        name: dto.name,
        displayName: dto.displayName.trim(),
        description: dto.description.trim(),
        parameters: dto.parameters as never,
        method: dto.method,
        url: dto.url.trim(),
        headers: this.encryptHeaders(dto.headers) as never,
        bodyTemplate: (dto.bodyTemplate ?? null) as never,
        timeoutMs: dto.timeoutMs ?? null,
        enabled: dto.enabled ?? true,
      } as never,
      include: TOOL_INCLUDE,
    });
    this.logger.log(`Tool creada id=${(created as { id: string }).id} name=${dto.name}`);
    return this.toDto(created as unknown as ToolRow);
  }

  async update(id: string, dto: UpdateAgentToolDto): Promise<AgentToolDto> {
    this.ctx();
    const existing = await this.prisma.scoped.agentCustomTool.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException(`Tool ${id} no encontrada`);

    if (dto.name !== undefined && dto.name !== (existing as { name: string }).name) {
      this.validateName(dto.name);
      await this.assertNameFree(dto.name);
    }
    if (dto.parameters !== undefined) this.validateParameters(dto.parameters);
    if (dto.url !== undefined) this.validateUrl(dto.url);

    const updated = await this.prisma.scoped.agentCustomTool.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.parameters !== undefined ? { parameters: dto.parameters as never } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.headers !== undefined
          ? {
              headers: this.encryptHeaders(
                dto.headers,
                (existing as { headers: unknown }).headers as CustomToolHeader[] | null,
              ) as never,
            }
          : {}),
        ...(dto.bodyTemplate !== undefined ? { bodyTemplate: dto.bodyTemplate as never } : {}),
        ...(dto.timeoutMs !== undefined ? { timeoutMs: dto.timeoutMs } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
      include: TOOL_INCLUDE,
    });
    return this.toDto(updated as unknown as ToolRow);
  }

  async remove(id: string): Promise<void> {
    this.ctx();
    const existing = await this.prisma.scoped.agentCustomTool.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException(`Tool ${id} no encontrada`);
    await this.prisma.scoped.agentCustomTool.delete({ where: { id } });
    this.logger.log(`Tool eliminada id=${id}`);
  }

  /** Reemplaza el set completo de tools del agente (semántica PUT). */
  async assignToAgent(agentId: string, toolIds: string[]): Promise<{ toolIds: string[] }> {
    this.ctx();
    const agent = await this.prisma.scoped.agent.findFirst({
      where: { id: agentId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException(`Agente ${agentId} no encontrado`);

    const unique = [...new Set(toolIds)];
    if (unique.length > 0) {
      // Verificación de pertenencia vía cliente scoped: una tool de otro team no aparece.
      const owned = await this.prisma.scoped.agentCustomTool.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      const ownedIds = new Set((owned as { id: string }[]).map((t) => t.id));
      const missing = unique.filter((tid) => !ownedIds.has(tid));
      if (missing.length > 0) {
        throw new BadRequestException(`Tools inexistentes o de otro team: ${missing.join(', ')}`);
      }
    }

    // El Link no tiene org/team propio (acceso siempre vía tool/agent scoped):
    // las escrituras van por el cliente raíz, ya validada la pertenencia arriba.
    await this.prisma.$transaction([
      this.prisma.agentCustomToolLink.deleteMany({ where: { agentId } }),
      ...(unique.length > 0
        ? [
            this.prisma.agentCustomToolLink.createMany({
              data: unique.map((toolId) => ({ agentId, toolId })),
            }),
          ]
        : []),
    ]);
    this.logger.log(`Tools del agente ${agentId} reemplazadas: [${unique.join(', ')}]`);
    return { toolIds: unique };
  }

  /** Tools asignadas a un agente (ids), para el editor de la UI. */
  async listForAgent(agentId: string): Promise<{ toolIds: string[] }> {
    this.ctx();
    const agent = await this.prisma.scoped.agent.findFirst({
      where: { id: agentId },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException(`Agente ${agentId} no encontrado`);
    const links = await this.prisma.agentCustomToolLink.findMany({
      where: { agentId },
      select: { toolId: true },
    });
    return { toolIds: links.map((l) => l.toolId) };
  }

  // -------------------------------------------------------------------------

  private validateName(name: string): void {
    if (!AGENT_TOOL_NAME_RE.test(name)) {
      throw new BadRequestException('El nombre técnico debe ser snake_case (^[a-z][a-z0-9_]{0,63}$)');
    }
    if (BUILTIN_TOOL_NAMES.has(name)) {
      throw new BadRequestException(`"${name}" es una tool built-in del sistema, elegí otro nombre`);
    }
  }

  private async assertNameFree(name: string): Promise<void> {
    const dup = await this.prisma.scoped.agentCustomTool.findFirst({
      where: { name },
      select: { id: true },
    });
    if (dup) throw new BadRequestException(`Ya existe una tool llamada "${name}" en este team`);
  }

  /** Fail-fast de UX: el JSON Schema raíz debe ser un objeto (lo que esperan los LLM). */
  private validateParameters(parameters: Record<string, unknown>): void {
    if (parameters.type !== 'object') {
      throw new BadRequestException('parameters debe ser un JSON Schema con raíz { "type": "object" }');
    }
    if (parameters.properties !== undefined && typeof parameters.properties !== 'object') {
      throw new BadRequestException('parameters.properties debe ser un objeto');
    }
    if (parameters.required !== undefined && !Array.isArray(parameters.required)) {
      throw new BadRequestException('parameters.required debe ser un array de strings');
    }
  }

  /** Fail-fast de UX: URL parseable y http(s). La validación fuerte (SSRF,
   *  allowlist de http en prod) la hace el executor al ejecutar. */
  private validateUrl(url: string): void {
    // La URL puede tener {{args.x}}: probamos con los placeholders sustituidos.
    const probe = url.replace(/\{\{[^}]*\}\}/g, 'x');
    let parsed: URL;
    try {
      parsed = new URL(probe);
    } catch {
      throw new BadRequestException('URL inválida (debe ser absoluta, http(s)://…)');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('La URL debe usar http:// o https://');
    }
  }

  /** Encripta los values con secret=true. En updates, un value enmascarado
   *  conserva el secreto previo del mismo key (si existía). */
  private encryptHeaders(
    headers: AgentToolHeaderDto[] | undefined,
    previous?: CustomToolHeader[] | null,
  ): CustomToolHeader[] {
    if (!headers || headers.length === 0) return [];
    const prevByKey = new Map((previous ?? []).map((h) => [h.key, h]));
    return headers.map((h) => {
      const secret = h.secret === true;
      if (!secret) return { key: h.key, value: h.value, secret: false };
      if (h.value === SECRET_MASK) {
        const prev = prevByKey.get(h.key);
        if (prev?.secret && prev.value) return { key: h.key, value: prev.value, secret: true };
        throw new BadRequestException(
          `El header secreto "${h.key}" no tiene valor previo: ingresá el valor real`,
        );
      }
      return { key: h.key, value: this.encryption.encrypt(h.value), secret: true };
    });
  }

  private toDto(row: ToolRow): AgentToolDto {
    const headers = ((row.headers as CustomToolHeader[] | null) ?? []).map((h) => ({
      key: h.key,
      value: h.secret ? SECRET_MASK : h.value,
      secret: h.secret === true,
    }));
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      parameters: row.parameters,
      method: row.method,
      url: row.url,
      headers,
      bodyTemplate: row.bodyTemplate,
      timeoutMs: row.timeoutMs,
      enabled: row.enabled,
      agentIds: row.agents.map((a) => a.agentId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
