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

    // Llamar a SES
    const sesResult = await this.ses.createIdentity(normalized);

    // Persistir
    const row = await this.prisma.emailDomain.create({
      data: {
        organizationId: ctx.organizationId,
        domain: normalized,
        status: mapSesStatus(sesResult.dkimStatus, sesResult.verifiedForSending),
        dkimTokens: sesResult.dkimTokens as unknown as object,
        lastCheckedAt: new Date(),
        verifiedAt: sesResult.verifiedForSending ? new Date() : null,
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

    const sesResult = await this.ses.getIdentity(row.domain);
    const status = mapSesStatus(sesResult.dkimStatus, sesResult.verifiedForSending);
    const updated = await this.prisma.emailDomain.update({
      where: { id },
      data: {
        status,
        dkimTokens: sesResult.dkimTokens as unknown as object,
        lastCheckedAt: new Date(),
        verifiedAt:
          status === 'VERIFIED' && row.verifiedAt === null ? new Date() : row.verifiedAt,
        failureReason:
          status === 'FAILED'
            ? row.failureReason ?? 'DKIM verification failed in SES'
            : null,
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
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: EmailDomain): EmailDomainDetail {
  return {
    ...toSummary(row),
    dkimRecords: parseTokens(row.dkimTokens),
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
