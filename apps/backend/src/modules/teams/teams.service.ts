import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateTeamDto, UpdateTeamDto } from './teams.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista todos los teams de la org actual donde el user es miembro.
   * OWNER/ADMIN de org ven todos los teams.
   */
  async findAll(): Promise<TeamListItem[]> {
    const ctx = this.requireContext();

    // OWNER y ADMIN de org ven todos los teams de la org
    if (ctx.orgRole === 'OWNER' || ctx.orgRole === 'ADMIN') {
      return this.prisma.team.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: { _count: { select: { memberships: true } } },
      });
    }

    // El resto solo ve teams donde es miembro
    return this.prisma.team.findMany({
      where: {
        organizationId: ctx.organizationId,
        memberships: { some: { userId: ctx.userId } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { memberships: true } } },
    });
  }

  async findOne(teamId: string): Promise<TeamListItem> {
    const ctx = this.requireContext();

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!team || team.organizationId !== ctx.organizationId) {
      throw new NotFoundException('Team no encontrado');
    }

    return team;
  }

  async create(dto: CreateTeamDto): Promise<TeamListItem> {
    const ctx = this.requireContext();

    // Verificar que el slug no existe ya en esta org
    const existing = await this.prisma.team.findUnique({
      where: {
        organizationId_slug: {
          organizationId: ctx.organizationId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un team con slug "${dto.slug}" en esta organización`);
    }

    const team = await this.prisma.team.create({
      data: {
        organizationId: ctx.organizationId,
        name: dto.name,
        slug: dto.slug,
        isDefault: false,
      },
      include: { _count: { select: { memberships: true } } },
    });

    // Auto-asignar al creador como ADMIN del team
    await this.prisma.teamMembership.create({
      data: {
        userId: ctx.userId,
        teamId: team.id,
        role: 'ADMIN',
      },
    });

    this.logger.log(`Team created: ${team.id} (${team.slug}) in org ${ctx.organizationId}`);
    return team;
  }

  async update(teamId: string, dto: UpdateTeamDto): Promise<TeamListItem> {
    const ctx = this.requireContext();

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== ctx.organizationId) {
      throw new NotFoundException('Team no encontrado');
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: { name: dto.name },
      include: { _count: { select: { memberships: true } } },
    });
  }

  async remove(teamId: string): Promise<void> {
    const ctx = this.requireContext();

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== ctx.organizationId) {
      throw new NotFoundException('Team no encontrado');
    }

    if (team.isDefault) {
      throw new ForbiddenException('No se puede eliminar el team por defecto ("General")');
    }

    await this.prisma.team.delete({ where: { id: teamId } });
    this.logger.log(`Team deleted: ${teamId} from org ${ctx.organizationId}`);
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant');
    }
    return ctx;
  }
}

export interface TeamListItem {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  createdAt: Date;
  _count: { memberships: number };
}
