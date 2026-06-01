import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SesDomainsService } from './ses-domains.service';
import { DnsVerificationService } from './dns-verification.service';

const TICK_MS = 5 * 60_000;
/**
 * Cuántos dominios poll-ear por tick. Cap defensivo para no martillar SES
 * GetEmailIdentity si crece la base. Si querés más, fragmentar en múltiples
 * ticks alcanza — un dominio que no se refresque ahora se refresca en el
 * próximo (5 min después).
 */
const BATCH_LIMIT = 50;

/**
 * Cron in-process que refresca el status de los EmailDomain en estados
 * **transitorios** (PENDING + TEMPORARY_FAILURE) cada 5 min consultando SES.
 * Los VERIFIED no se re-checkean (SES no devuelve degradación on-the-fly y
 * la baja la driveamos via webhook futuro o re-checkeo manual del usuario).
 *
 * Patrón calcado del WapiBotWaitingExpirer: setInterval + onModuleInit/Destroy,
 * sin @nestjs/schedule. Multi-instance safe: cada worker compite por las
 * mismas filas, pero el update es idempotente (mismo status from SES).
 *
 * Disable via env `EMAIL_DOMAIN_POLLER_ENABLED=false` para correrlo solo en
 * un nodo cuando escalemos a multi-instance.
 */
@Injectable()
export class EmailDomainsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailDomainsPollerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ses: SesDomainsService,
    private readonly dns: DnsVerificationService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('EMAIL_DOMAIN_POLLER_ENABLED') === 'false') {
      this.logger.warn('Email domain poller disabled via EMAIL_DOMAIN_POLLER_ENABLED=false');
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.warn(
          `tick falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(`Email domain poller arrancó (cada ${TICK_MS / 1000}s)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ checked: number; transitioned: number }> {
    // Candidates: PENDING/TEMP_FAILURE (SES re-check) + cualquiera con DNS
    // stale (> 1h sin chequear) o nunca chequeado. La query es un OR amplio;
    // dentro del loop decidimos qué chequear por row.
    const dnsStaleThreshold = new Date(Date.now() - 60 * 60_000);
    const candidates = await this.prisma.emailDomain.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING', 'TEMPORARY_FAILURE'] } },
          { dnsLastCheckedAt: null },
          { dnsLastCheckedAt: { lt: dnsStaleThreshold } },
        ],
      },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: BATCH_LIMIT,
      select: {
        id: true,
        domain: true,
        status: true,
        verifiedAt: true,
        spfStatus: true,
        dmarcStatus: true,
        dnsLastCheckedAt: true,
      },
    });

    if (candidates.length === 0) return { checked: 0, transitioned: 0 };

    let transitioned = 0;
    for (const row of candidates) {
      try {
        const needsSes = row.status === 'PENDING' || row.status === 'TEMPORARY_FAILURE';
        const needsDns =
          row.dnsLastCheckedAt === null ||
          row.dnsLastCheckedAt < dnsStaleThreshold;

        // Corremos lo que aplica en paralelo. Ambos checks son independientes.
        const [sesResult, spfCheck, dmarcCheck] = await Promise.all([
          needsSes ? this.ses.getIdentity(row.domain) : Promise.resolve(null),
          needsDns ? this.dns.checkSpf(row.domain) : Promise.resolve(null),
          needsDns ? this.dns.checkDmarc(row.domain) : Promise.resolve(null),
        ]);

        const now = new Date();
        const data: Record<string, unknown> = {};

        if (sesResult) {
          const newStatus = mapSesStatus(sesResult.dkimStatus, sesResult.verifiedForSending);
          if (newStatus !== row.status) {
            transitioned++;
            this.logger.log(
              `EmailDomain ${row.domain} DKIM → ${row.status} → ${newStatus} (poller)`,
            );
          }
          data.status = newStatus;
          data.dkimTokens = sesResult.dkimTokens as unknown as object;
          data.lastCheckedAt = now;
          if (newStatus === 'VERIFIED' && row.verifiedAt === null) data.verifiedAt = now;
          data.failureReason = newStatus === 'FAILED' ? 'DKIM verification failed in SES' : null;
        }

        if (spfCheck) {
          if (spfCheck.status !== row.spfStatus) {
            this.logger.log(
              `EmailDomain ${row.domain} SPF → ${row.spfStatus} → ${spfCheck.status} (poller)`,
            );
          }
          data.spfStatus = spfCheck.status;
          data.spfRecord = spfCheck.record;
        }
        if (dmarcCheck) {
          if (dmarcCheck.status !== row.dmarcStatus) {
            this.logger.log(
              `EmailDomain ${row.domain} DMARC → ${row.dmarcStatus} → ${dmarcCheck.status} (poller)`,
            );
          }
          data.dmarcStatus = dmarcCheck.status;
          data.dmarcRecord = dmarcCheck.record;
        }
        if (needsDns) data.dnsLastCheckedAt = now;

        if (Object.keys(data).length > 0) {
          await this.prisma.emailDomain.update({ where: { id: row.id }, data });
        }
      } catch (err) {
        this.logger.warn(
          `EmailDomain ${row.domain}: refresh falló — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { checked: candidates.length, transitioned };
  }
}

import type { EmailDomainStatus } from '@massivo/shared-types';
import type { SesDkimStatus } from './ses-domains.service';

function mapSesStatus(
  dkim: SesDkimStatus,
  verifiedForSending: boolean,
): EmailDomainStatus {
  if (verifiedForSending || dkim === 'SUCCESS') return 'VERIFIED';
  if (dkim === 'FAILED') return 'FAILED';
  if (dkim === 'TEMPORARY_FAILURE') return 'TEMPORARY_FAILURE';
  return 'PENDING';
}
