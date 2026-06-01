import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EmailDomain } from '@massivo/prisma';
import type {
  EmailDomainDetail,
  EmailDomainSummary,
  EmailDomainStatus,
} from '@massivo/shared-types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { SesDomainsService, type SesDkimStatus, type SesDkimToken } from './ses-domains.service';
import { DnsVerificationService } from './dns-verification.service';

/**
 * Orquesta el ciclo de vida de dominios verificados en SES desde el panel:
 *  1. `create()`   — registra en SES, persiste en DB con DKIM tokens, devuelve los CNAMEs al cliente.
 *  2. `list()`     — todos los dominios de la org activa (TenantContext).
 *  3. `findOne()`  — detalle con tokens (para mostrar registros DNS).
 *  4. `refresh()`  — re-sincroniza el status desde SES (manual o cron).
 *  5. `remove()`   — borra de SES y de DB. Falla si hay SmtpAccount vinculado.
 *
 * Quota: chequea `Plan.limits.dedicatedDomains` antes de crear. -1 = ilimitado.
 */
@Injectable()
export class EmailDomainsService {
  private readonly logger = new Logger(EmailDomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ses: SesDomainsService,
    private readonly dns: DnsVerificationService,
  ) {}

  async create(dto: { domain: string }): Promise<EmailDomainDetail> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('create sin TenantContext');

    const normalized = dto.domain.toLowerCase().trim();

    // Quota check contra Plan.limits.dedicatedDomains
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: { plan: true },
    });
    const limits = (org.plan.limits ?? {}) as Record<string, unknown>;
    const rawLimit = limits.dedicatedDomains;
    const limit = typeof rawLimit === 'number' ? rawLimit : 0;
    if (limit >= 0) {
      const current = await this.prisma.emailDomain.count({
        where: { organizationId: ctx.organizationId },
      });
      if (current >= limit) {
        throw new ForbiddenException(
          `El plan ${org.plan.code} permite hasta ${limit} dominio(s) dedicado(s). Subí de plan para agregar más.`,
        );
      }
    }

    // Duplicate en esta org
    const existing = await this.prisma.emailDomain.findUnique({
      where: { organizationId_domain: { organizationId: ctx.organizationId, domain: normalized } },
    });
    if (existing) {
      throw new ConflictException(`El dominio ${normalized} ya está registrado en tu organización.`);
    }

    // Llamar a SES + DNS lookups en paralelo. SPF/DMARC son consultas TXT
    // independientes (~50-100ms cada una), no esperan al SES.
    const [sesResult, spfCheck, dmarcCheck] = await Promise.all([
      this.ses.createIdentity(normalized),
      this.dns.checkSpf(normalized),
      this.dns.checkDmarc(normalized),
    ]);
    const now = new Date();

    // Persistir
    const row = await this.prisma.emailDomain.create({
      data: {
        organizationId: ctx.organizationId,
        domain: normalized,
        status: mapSesStatus(sesResult.dkimStatus, sesResult.verifiedForSending),
        dkimTokens: sesResult.dkimTokens as unknown as object,
        lastCheckedAt: now,
        verifiedAt: sesResult.verifiedForSending ? now : null,
        spfStatus: spfCheck.status,
        spfRecord: spfCheck.record,
        dmarcStatus: dmarcCheck.status,
        dmarcRecord: dmarcCheck.record,
        dnsLastCheckedAt: now,
      },
    });

    this.logger.log(
      `EmailDomain ${normalized} → ${row.status} (org ${ctx.organizationId})`,
    );
    return toDetail(row);
  }

  async list(): Promise<EmailDomainSummary[]> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('list sin TenantContext');
    const rows = await this.prisma.emailDomain.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  async findOne(id: string): Promise<EmailDomainDetail> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('findOne sin TenantContext');
    const row = await this.prisma.emailDomain.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!row) throw new NotFoundException(`EmailDomain ${id} no encontrado`);
    return toDetail(row);
  }

  /**
   * Re-consulta SES y actualiza el status local. Usado por endpoint manual
   * ("Verificar ahora") y por el poller cron. Devuelve el detalle actualizado.
   */
  async refresh(id: string): Promise<EmailDomainDetail> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('refresh sin TenantContext');
    const row = await this.prisma.emailDomain.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!row) throw new NotFoundException(`EmailDomain ${id} no encontrado`);

    const [sesResult, spfCheck, dmarcCheck] = await Promise.all([
      this.ses.getIdentity(row.domain),
      this.dns.checkSpf(row.domain),
      this.dns.checkDmarc(row.domain),
    ]);
    const now = new Date();
    const status = mapSesStatus(sesResult.dkimStatus, sesResult.verifiedForSending);
    const updated = await this.prisma.emailDomain.update({
      where: { id },
      data: {
        status,
        dkimTokens: sesResult.dkimTokens as unknown as object,
        lastCheckedAt: now,
        verifiedAt:
          status === 'VERIFIED' && row.verifiedAt === null ? now : row.verifiedAt,
        failureReason:
          status === 'FAILED'
            ? row.failureReason ?? 'DKIM verification failed in SES'
            : null,
        spfStatus: spfCheck.status,
        spfRecord: spfCheck.record,
        dmarcStatus: dmarcCheck.status,
        dmarcRecord: dmarcCheck.record,
        dnsLastCheckedAt: now,
      },
    });

    if (row.status !== status) {
      this.logger.log(
        `EmailDomain ${row.domain} → ${row.status} → ${status} (refresh manual)`,
      );
    }
    return toDetail(updated);
  }

  async remove(id: string): Promise<void> {
    const ctx = TenantContext.current();
    if (!ctx) throw new Error('remove sin TenantContext');
    const row = await this.prisma.emailDomain.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { _count: { select: { smtpAccounts: true } } },
    });
    if (!row) throw new NotFoundException(`EmailDomain ${id} no encontrado`);
    if (row._count.smtpAccounts > 0) {
      throw new BadRequestException(
        `No se puede borrar: hay ${row._count.smtpAccounts} cuenta(s) SMTP vinculadas a este dominio. Desvinculá primero.`,
      );
    }

    await this.ses.deleteIdentity(row.domain);
    await this.prisma.emailDomain.delete({ where: { id } });
    this.logger.log(`EmailDomain ${row.domain} borrado (org ${ctx.organizationId})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function mapSesStatus(
  dkim: SesDkimStatus,
  verifiedForSending: boolean,
): EmailDomainStatus {
  if (verifiedForSending || dkim === 'SUCCESS') return 'VERIFIED';
  if (dkim === 'FAILED') return 'FAILED';
  if (dkim === 'TEMPORARY_FAILURE') return 'TEMPORARY_FAILURE';
  return 'PENDING';
}

function toSummary(row: EmailDomain): EmailDomainSummary {
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    spfStatus: row.spfStatus,
    dmarcStatus: row.dmarcStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    dnsLastCheckedAt: row.dnsLastCheckedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: EmailDomain): EmailDomainDetail {
  return {
    ...toSummary(row),
    dkimRecords: parseTokens(row.dkimTokens),
    spfRecord: row.spfRecord,
    dmarcRecord: row.dmarcRecord,
    recommendedRecords: {
      spf: {
        name: row.domain,
        value: 'v=spf1 include:amazonses.com ~all',
      },
      dmarc: {
        name: `_dmarc.${row.domain}`,
        // p=none = monitor mode, no rechaza nada pero satisface Gmail/Yahoo 2024.
        // El user puede subirla a quarantine/reject cuando esté seguro de su tráfico.
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@' + row.domain,
      },
    },
  };
}

function parseTokens(raw: unknown): SesDkimToken[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is SesDkimToken =>
      typeof t === 'object' &&
      t !== null &&
      typeof (t as SesDkimToken).name === 'string' &&
      typeof (t as SesDkimToken).value === 'string',
  );
}
