import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    try {
      const secretKey = this.configService.get<string>('CLERK_SECRET_KEY');
      if (!secretKey) {
        throw new Error('CLERK_SECRET_KEY no está configurado');
      }

      // Verifies the token using Clerk's JWKS
      const payload = await verifyToken(token, {
        secretKey: secretKey,
      });

      // Inject the decoded information into the request for downstream guards (e.g. TenantContextGuard).
      // Clerk v2 JWT pone la org en `o.id`; v1 la pone en `org_id`. Soportamos ambos.
      const orgId =
        (payload as { org_id?: string }).org_id ??
        (payload as { o?: { id?: string } }).o?.id;
      (request as Request & { clerkUserId: string; clerkOrgId?: string }).clerkUserId = payload.sub;
      (request as Request & { clerkUserId: string; clerkOrgId?: string }).clerkOrgId = orgId;

      return true;
    } catch (err) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
