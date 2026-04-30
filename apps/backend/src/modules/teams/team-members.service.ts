import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { AddTeamMemberDto, UpdateTeamMemberRoleDto } from './team-members.dto';

@Injectable()
export class TeamMembersService {
  private readonly logger = new Logger(TeamMembersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Lista miembros de un team */
  async findAll(teamId: string) {
    const ctx = this.requireContext();
    await this.validateTeamBelongsToOrg(teamId, ctx.organizationId);

    return this.prisma.teamMembership.findMany({
      where: { teamId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Agrega un user al team. El user debe pertenecer a la org. */
  async addMember(teamId: string, dto: AddTeamMemberDto) {
    const ctx = this.requireContext();
    await this.validateTeamBelongsToOrg(teamId, ctx.organizationId);

    // Verificar que el user pertenece a la org
    const orgMembership = await this.prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: dto.userId,
          organizationId: ctx.organizationId,
        },
      },
    });
    if (!orgMembership) {
      throw new ForbiddenException(
        'El usuario no es miembro de esta organización. Invitalo primero desde la configuración de la organización.',
      );
    }

    // Verificar que no está ya en el team
    const existing = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: dto.userId, teamId } },
    });
    if (existing) {
      throw new ConflictException('El usuario ya es miembro de este team');
    }

    const membership = await this.prisma.teamMembership.create({
      data: {
        userId: dto.userId,
        teamId,
        role: dto.role,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`User ${dto.userId} added to team ${teamId} as ${dto.role}`);
    return membership;
  }

  /** Actualiza el rol de un miembro en un team */
  async updateRole(teamId: string, userId: string, dto: UpdateTeamMemberRoleDto) {
    const ctx = this.requireContext();
    await this.validateTeamBelongsToOrg(teamId, ctx.organizationId);

    const membership = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) {
      throw new NotFoundException('El usuario no es miembro de este team');
    }

    return this.prisma.teamMembership.update({
      where: { userId_teamId: { userId, teamId } },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
    });
  }

  /** Remueve un miembro de un team */
  async removeMember(teamId: string, userId: string) {
    const ctx = this.requireContext();
    await this.validateTeamBelongsToOrg(teamId, ctx.organizationId);

    // No permitir que el usuario se remueva a sí mismo si es el último ADMIN
    const membership = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) {
      throw new NotFoundException('El usuario no es miembro de este team');
    }

    if (membership.role === 'ADMIN') {
      const adminCount = await this.prisma.teamMembership.count({
        where: { teamId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new ForbiddenException(
          'No se puede remover al último administrador del team. Asigná otro admin primero.',
        );
      }
    }

    await this.prisma.teamMembership.delete({
      where: { userId_teamId: { userId, teamId } },
    });
    this.logger.log(`User ${userId} removed from team ${teamId}`);
  }

  private async validateTeamBelongsToOrg(teamId: string, organizationId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== organizationId) {
      throw new NotFoundException('Team no encontrado');
    }
    return team;
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
