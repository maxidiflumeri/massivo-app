import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '@massivo/shared-types';

export const SKIP_TENANT_SCOPE_KEY = 'skipTenantScope';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipTenantScope = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipTenantScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { clerkUserId?: string; clerkOrgId?: string; tenantContext?: RequestContext }>();
    const clerkUserId = request.clerkUserId;
    const clerkOrgId = request.clerkOrgId;
    const teamIdHeader = request.headers['x-team-id'] as string;

    if (!clerkUserId || !clerkOrgId) {
      throw new UnauthorizedException('Falta contexto de organización en el token');
    }

    if (!teamIdHeader) {
      throw new UnauthorizedException('Falta header X-Team-Id');
    }

    // Resolver usuario y org local
    const org = await this.prisma.organization.findUnique({
      where: { clerkOrgId },
    });
    
    const user = await this.prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!org || !user) {
      throw new UnauthorizedException('Usuario u organización no encontrados localmente');
    }

    // Validar membresía en la org
    const orgMembership = await this.prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
    });

    if (!orgMembership) {
      throw new ForbiddenException('No tienes acceso a esta organización');
    }

    // Validar team
    const team = await this.prisma.team.findUnique({
      where: { id: teamIdHeader },
    });

    if (!team || team.organizationId !== org.id) {
      throw new ForbiddenException('El team no pertenece a esta organización');
    }

    // Validar membresía en el team
    const teamMembership = await this.prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: team.id,
        },
      },
    });

    if (!teamMembership) {
      throw new ForbiddenException('No tienes acceso a este team');
    }

    // Inject context for the interceptor
    request.tenantContext = {
      userId: user.id,
      organizationId: org.id,
      teamId: team.id,
      orgRole: orgMembership.role,
      teamRole: teamMembership.role,
    };

    return true;
  }
}
