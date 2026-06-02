import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

/**
 * Payload del JWT de tracking. Mantenido corto (claves de 1 char) para que las URLs
 * inline en email no sean enormes.
 *   r = reportId, o = orgId, t = teamId, c = campaignId (vacío para transaccionales)
 */
export interface TrackingPayload {
  r: string;
  o: string;
  t: string;
  c: string; // Vacío "" para envíos transaccionales (sin campaña asociada).
}

@Injectable()
export class TrackingTokenService {
  private readonly logger = new Logger(TrackingTokenService.name);

  constructor(private readonly config: ConfigService) {}

  sign(payload: TrackingPayload): string {
    return jwt.sign(payload, this.secret(), { algorithm: 'HS256' });
  }

  verify(token: string): TrackingPayload {
    const decoded = jwt.verify(token, this.secret(), { algorithms: ['HS256'] });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as Record<string, unknown>).r !== 'string' ||
      typeof (decoded as Record<string, unknown>).o !== 'string' ||
      typeof (decoded as Record<string, unknown>).t !== 'string' ||
      typeof (decoded as Record<string, unknown>).c !== 'string'
    ) {
      throw new Error('Tracking token: payload inválido');
    }
    const p = decoded as TrackingPayload & { iat?: number };
    return { r: p.r, o: p.o, t: p.t, c: p.c };
  }

  private secret(): string {
    const s = this.config.get<string>('EMAIL_TRACKING_JWT_SECRET');
    if (!s) throw new Error('EMAIL_TRACKING_JWT_SECRET no configurado');
    return s;
  }

  publicUrl(): string {
    return this.config.get<string>('EMAIL_PUBLIC_URL') ?? 'http://localhost:3001';
  }
}
