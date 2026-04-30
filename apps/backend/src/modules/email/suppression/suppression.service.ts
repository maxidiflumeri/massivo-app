import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { hashEmail } from './email-hash';

export type SuppressionReason = 'unsubscribe-global' | 'unsubscribe-campaign' | 'bounce-hard';

export interface SuppressionResult {
  suppressed: boolean;
  reason?: SuppressionReason;
}

interface CheckInput {
  email: string;
  campaignId: string;
}

interface AddUnsubscribeInput {
  email: string;
  scope: 'GLOBAL' | 'CAMPAIGN';
  campaignId?: string | null;
  reason?: string;
  source?: string;
}

/**
 * Centraliza "este email está bloqueado para este team":
 *  - EmailUnsubscribe scope=GLOBAL → bloquea todo envío del team.
 *  - EmailUnsubscribe scope=CAMPAIGN con campaignId match → bloquea esa campaña.
 *  - EmailBounce hard activos (code='hard') → bloquea todo envío del team.
 *
 * Asume estar dentro de TenantContext.run — todas las queries usan prisma.scoped
 * y filtran por (organizationId, teamId) automáticamente.
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check({ email, campaignId }: CheckInput): Promise<SuppressionResult> {
    const emailHash = hashEmail(email);

    const unsub = await this.prisma.scoped.emailUnsubscribe.findFirst({
      where: {
        emailHash,
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'CAMPAIGN', campaignId },
        ],
      },
      select: { scope: true },
    });
    if (unsub) {
      return {
        suppressed: true,
        reason: unsub.scope === 'GLOBAL' ? 'unsubscribe-global' : 'unsubscribe-campaign',
      };
    }

    const normalized = email.trim().toLowerCase();
    const bounce = await this.prisma.scoped.emailBounce.findFirst({
      where: { email: normalized, code: 'hard' },
      select: { id: true },
    });
    if (bounce) return { suppressed: true, reason: 'bounce-hard' };

    return { suppressed: false };
  }

  /**
   * Idempotente: si ya existe un row con la misma combinación lo deja como está.
   * No usamos prisma.upsert porque el unique compound `(teamId, emailHash, scope, campaignId)`
   * con `campaignId NULL` no es deduplicable en Postgres (NULL distinto de NULL).
   */
  async addUnsubscribe(input: AddUnsubscribeInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const emailHash = hashEmail(email);
    const campaignId = input.scope === 'CAMPAIGN' ? input.campaignId ?? null : null;

    const existing = await this.prisma.scoped.emailUnsubscribe.findFirst({
      where: { emailHash, scope: input.scope, campaignId },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.scoped.emailUnsubscribe.create({
      data: {
        email,
        emailHash,
        scope: input.scope,
        campaignId,
        reason: input.reason,
        source: input.source,
      } as never,
    });
  }

  /**
   * Borra un EmailUnsubscribe por id dentro del tenant. Devuelve true si borró,
   * false si no existía / pertenecía a otro tenant.
   */
  async deleteUnsubscribe(id: string): Promise<boolean> {
    const r = await this.prisma.scoped.emailUnsubscribe.deleteMany({ where: { id } });
    return r.count > 0;
  }

  async deleteBounce(id: string): Promise<boolean> {
    const r = await this.prisma.scoped.emailBounce.deleteMany({ where: { id } });
    return r.count > 0;
  }
}
