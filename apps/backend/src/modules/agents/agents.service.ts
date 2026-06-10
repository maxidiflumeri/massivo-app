import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateAgentDto, UpdateAgentConfigDto } from './agents.dto';

const AGENT_SELECT = {
  id: true,
  name: true,
  enabled: true,
  model: true,
  systemPrompt: true,
  temperature: true,
  maxSteps: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Referencia liviana de canal conectado al agente. */
export interface AgentChannelRef {
  id: string;
  name: string | null;
  kind: string;
}

/** Contrato público del agente (evita filtrar tipos internos de Prisma). */
export interface AgentDto {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
  systemPrompt: string | null;
  temperature: number;
  maxSteps: number;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
  channels?: AgentChannelRef[];
}

/**
 * CRUD de Agentes IA. Multi-tenant vía `prisma.scoped` (filtro org+team
 * automático). El runtime corre aparte (`AgentRuntimeService`). Conectar/
 * desconectar = setear `Channel.agentId` (precedencia sobre el bot en runtime).
 */
@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  private ctx() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('Sin contexto de tenant');
    return ctx;
  }

  async list(): Promise<AgentDto[]> {
    this.ctx();
    const rows = await this.prisma.scoped.agent.findMany({
      orderBy: { createdAt: 'desc' },
      select: { ...AGENT_SELECT, channels: { select: { id: true, name: true, kind: true } } },
    });
    return rows as unknown as AgentDto[];
  }

  async get(id: string): Promise<AgentDto> {
    this.ctx();
    const agent = await this.prisma.scoped.agent.findFirst({
      where: { id },
      select: { ...AGENT_SELECT, channels: { select: { id: true, name: true, kind: true } } },
    });
    if (!agent) throw new NotFoundException(`Agente ${id} no encontrado`);
    return agent as unknown as AgentDto;
  }

  async create(dto: CreateAgentDto): Promise<AgentDto> {
    const ctx = this.ctx();
    // Quota check contra Plan.limits.agents (mismo patrón que dedicatedDomains).
    // Límite por organización; -1 = ilimitado, ausente = 0.
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: { plan: true },
    });
    const limits = (org.plan.limits ?? {}) as Record<string, unknown>;
    const rawLimit = limits.agents;
    const limit = typeof rawLimit === 'number' ? rawLimit : 0;
    if (limit >= 0) {
      const current = await this.prisma.agent.count({
        where: { organizationId: ctx.organizationId },
      });
      if (current >= limit) {
        throw new ForbiddenException(
          `El plan ${org.plan.code} permite hasta ${limit} agente(s). Subí de plan para crear más.`,
        );
      }
    }
    const created = await this.prisma.scoped.agent.create({
      data: {
        organizationId: ctx.organizationId,
        teamId: ctx.teamId,
        name: dto.name.trim(),
      } as never,
      select: AGENT_SELECT,
    });
    return created as unknown as AgentDto;
  }

  async update(id: string, dto: UpdateAgentConfigDto): Promise<AgentDto> {
    this.ctx();
    await this.assertExists(id);
    const updated = await this.prisma.scoped.agent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
        ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
        ...(dto.maxSteps !== undefined ? { maxSteps: dto.maxSteps } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings as never } : {}),
      } as never,
      select: AGENT_SELECT,
    });
    return updated as unknown as AgentDto;
  }

  async remove(id: string): Promise<{ id: string }> {
    this.ctx();
    await this.assertExists(id);
    // onDelete: SetNull en Channel.agentId → los canales quedan sin agente.
    await this.prisma.scoped.agent.delete({ where: { id } });
    return { id };
  }

  /** Conecta el agente a un canal (precedencia sobre el bot en runtime). */
  async connectChannel(agentId: string, channelId: string): Promise<{ id: string; agentId: string }> {
    this.ctx();
    await this.assertExists(agentId);
    const channel = await this.prisma.scoped.channel.findFirst({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException(`Canal ${channelId} no encontrado`);
    await this.prisma.scoped.channel.update({
      where: { id: channelId },
      // Exclusividad bot/agente: conectar un agente desvincula cualquier bot del canal.
      data: { agentId, botId: null } as never,
    });
    return { id: channelId, agentId };
  }

  async disconnectChannel(agentId: string, channelId: string): Promise<{ id: string }> {
    this.ctx();
    await this.assertExists(agentId);
    await this.prisma.scoped.channel.updateMany({
      where: { id: channelId, agentId } as never,
      data: { agentId: null } as never,
    });
    return { id: channelId };
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.scoped.agent.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Agente ${id} no encontrado`);
  }
}
