import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { hashPhone } from './phone-hash';

export const DEFAULT_OPT_OUT_KEYWORDS = ['BAJA', 'STOP', 'UNSUBSCRIBE', 'CANCELAR'] as const;

interface CheckInput {
  phone: string;
  campaignId?: string | null;
}

interface AddInput {
  phone: string;
  scope: 'GLOBAL' | 'CAMPAIGN';
  campaignId?: string | null;
  reason?: string;
  source?: string;
}

export interface OptOutCheckResult {
  optedOut: boolean;
  scope?: 'GLOBAL' | 'CAMPAIGN';
}

/**
 * Centraliza el estado opt-out por (team, phone). Mirror de SuppressionService
 * para email — ambos siguen el mismo patrón de hash + scope GLOBAL/CAMPAIGN.
 *
 * Uso típico:
 *  - `check()` en el worker antes de enviar (skip si opted-out).
 *  - `add()` en el webhook al detectar keyword inbound, o desde admin UI.
 *
 * Asume estar dentro de TenantContext.run.
 */
@Injectable()
export class WapiOptOutService {
  private readonly logger = new Logger(WapiOptOutService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve la lista efectiva de keywords para un config: si el config tiene
   * keywords custom las usa, si no usa los defaults internos. Retorna keywords
   * normalizadas (UPPERCASE, trim, sin vacíos).
   */
  resolveKeywords(configKeywords: string[] | null | undefined): string[] {
    const list = configKeywords && configKeywords.length > 0 ? configKeywords : DEFAULT_OPT_OUT_KEYWORDS;
    return list.map((k) => k.trim().toUpperCase()).filter(Boolean);
  }

  /**
   * Detecta si un body de mensaje texto matchea alguna keyword. Match es
   * case-insensitive y exige que el body completo (post-trim) sea exactamente
   * la keyword — evitamos falsos positivos por palabras dentro de un mensaje
   * más largo (ej. "no tengo problema con la baja del dólar").
   */
  matchKeyword(body: string, keywords: string[]): string | null {
    const normalized = body.trim().toUpperCase();
    if (!normalized) return null;
    return keywords.find((k) => k === normalized) ?? null;
  }

  async check({ phone, campaignId }: CheckInput): Promise<OptOutCheckResult> {
    const phoneHash = hashPhone(phone);
    const where: Record<string, unknown> = { phoneHash };
    if (campaignId) {
      where.OR = [{ scope: 'GLOBAL' }, { scope: 'CAMPAIGN', campaignId }];
    } else {
      where.scope = 'GLOBAL';
    }
    const row = await this.prisma.scoped.wapiOptOut.findFirst({
      where: where as never,
      select: { scope: true },
    });
    if (!row) return { optedOut: false };
    return { optedOut: true, scope: row.scope as 'GLOBAL' | 'CAMPAIGN' };
  }

  /**
   * Idempotente: si ya existe un row con la misma combinación lo deja como
   * está. Igual que SuppressionService.addUnsubscribe — el unique compound
   * `(teamId, phoneHash, scope, campaignId)` con `campaignId NULL` no es
   * deduplicable en Postgres (NULL distinto de NULL), así que checkeamos manual.
   */
  async add(input: AddInput): Promise<void> {
    const phoneHash = hashPhone(input.phone);
    const campaignId = input.scope === 'CAMPAIGN' ? input.campaignId ?? null : null;

    const existing = await this.prisma.scoped.wapiOptOut.findFirst({
      where: { phoneHash, scope: input.scope, campaignId } as never,
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.scoped.wapiOptOut.create({
      data: {
        phone: input.phone.trim(),
        phoneHash,
        scope: input.scope,
        campaignId,
        reason: input.reason,
        source: input.source,
      } as never,
    });
    this.logger.log(`WapiOptOut added phoneHash=${phoneHash.slice(0, 8)}… scope=${input.scope} source=${input.source ?? 'n/a'}`);
  }
}
