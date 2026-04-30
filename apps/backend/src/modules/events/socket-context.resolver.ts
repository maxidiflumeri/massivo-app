import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestContext } from '@massivo/shared-types';

export interface SocketHandshakeAuth {
  token?: unknown;
  teamId?: unknown;
}

@Injectable()
export class SocketContextResolver {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(auth: SocketHandshakeAuth): Promise<RequestContext> {
    const token = typeof auth.token === 'string' ? auth.token : null;
    const teamId = typeof auth.teamId === 'string' ? auth.teamId : null;

    if (!token) throw new UnauthorizedException('Falta auth.token');
    if (!teamId) throw new UnauthorizedException('Falta auth.teamId');

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) throw new UnauthorizedException('Backend mal configurado');

    let clerkUserId: string;
    let clerkOrgId: string | undefined;
    try {
      const payload = await verifyToken(token, { secretKey });
      clerkUserId = payload.sub;
      clerkOrgId =
        (payload as { org_id?: string }).org_id ??
        (payload as { o?: { id?: string } }).o?.id;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (!clerkOrgId) throw new UnauthorizedException('Falta org en el token');

    const [org, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { clerkOrgId } }),
      this.prisma.user.findUnique({ where: { clerkUserId } }),
    ]);
    if (!org || !user) throw new UnauthorizedException('Usuario u org no encontrados');

    const orgMembership = await this.prisma.orgMembership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    });
    if (!orgMembership) throw new UnauthorizedException('Sin acceso a la organización');

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== org.id) {
      throw new UnauthorizedException('El team no pertenece a la organización');
    }

    const teamMembership = await this.prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: user.id, teamId: team.id } },
    });
    if (!teamMembership) throw new UnauthorizedException('Sin acceso al team');

    return {
      userId: user.id,
      organizationId: org.id,
      teamId: team.id,
      orgRole: orgMembership.role,
      teamRole: teamMembership.role,
    };
  }
}
