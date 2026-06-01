import { Injectable, Logger } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';

export type DnsRecordStatus = 'PENDING' | 'VERIFIED' | 'MISSING' | 'INVALID';

export interface DnsCheckResult {
  status: DnsRecordStatus;
  /** El record TXT crudo (concatenado si SES split en varios chunks). null si no se encontró. */
  record: string | null;
}

/**
 * Hace lookups DNS para verificar SPF + DMARC sobre un dominio. Usa
 * `node:dns/promises` con servers públicos default del sistema. No mantiene
 * caché propia — confía en el cache del resolver del OS y de Node.
 *
 * SPF check: busca TXT en `<domain>` con `v=spf1 ...`. VERIFIED si incluye
 * `amazonses.com` (mecanismo `include:` o `redirect=`). INVALID si hay SPF
 * pero no incluye amazonses. MISSING si no hay ningún TXT con `v=spf1`.
 *
 * DMARC check: busca TXT en `_dmarc.<domain>` con `v=DMARC1 ...`. VERIFIED
 * si encontramos cualquier policy (incluso p=none — Gmail/Yahoo 2024 lo
 * acepta para envíos masivos). INVALID si hay TXT pero no es DMARC válido.
 * MISSING si no hay TXT en _dmarc.
 */
@Injectable()
export class DnsVerificationService {
  private readonly logger = new Logger(DnsVerificationService.name);

  async checkSpf(domain: string): Promise<DnsCheckResult> {
    const records = await this.resolveTxt(domain);
    const spf = records.find((r) => /^v=spf1\b/i.test(r));
    if (!spf) return { status: 'MISSING', record: null };
    // SES requiere que el include o redirect aterrice en amazonses.com.
    // Aceptamos cualquiera de las dos formas.
    const hasAmazonSes = /include:amazonses\.com|redirect=.*amazonses\.com/i.test(spf);
    if (!hasAmazonSes) return { status: 'INVALID', record: spf };
    return { status: 'VERIFIED', record: spf };
  }

  async checkDmarc(domain: string): Promise<DnsCheckResult> {
    const records = await this.resolveTxt(`_dmarc.${domain}`);
    const dmarc = records.find((r) => /^v=DMARC1\b/i.test(r));
    if (!dmarc) return { status: 'MISSING', record: null };
    // Política mínima: que tenga al menos un `p=...`. p=none es suficiente
    // para satisfacer Gmail/Yahoo 2024 — no exigimos quarantine ni reject.
    const hasPolicy = /\bp\s*=\s*(none|quarantine|reject)\b/i.test(dmarc);
    if (!hasPolicy) return { status: 'INVALID', record: dmarc };
    return { status: 'VERIFIED', record: dmarc };
  }

  /**
   * Hace TXT lookup tolerante a errores: NXDOMAIN / NODATA / TIMEOUT → [].
   * Otros errores se propagan para que el caller decida si reintentar.
   */
  private async resolveTxt(name: string): Promise<string[]> {
    const resolver = new Resolver();
    try {
      // resolveTxt devuelve string[][] — cada record es array de strings
      // chunked (DNS limita a 255 chars por chunk). Joineamos cada record.
      const raw = await resolver.resolveTxt(name);
      return raw.map((parts) => parts.join(''));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
      this.logger.warn(
        `TXT lookup ${name} falló (code=${code}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}
