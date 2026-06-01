import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Handlebars from 'handlebars';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import { EmailSenderService } from './sender/email-sender.service';
import type {
  CreateEmailTemplateDto,
  PreviewTemplateDto,
  SendTestTemplateDto,
  UpdateEmailTemplateDto,
} from './email-templates.dto';
import {
  CONTACT_BASE_VARIABLES,
  CONTACT_BASE_VARIABLE_KEYS,
  buildBaseSampleData,
  type EmailTemplateVariableDef,
} from './email-template-variables';

export interface EmailTemplateVariablesCatalog {
  base: EmailTemplateVariableDef[];
  custom: { key: string; sample?: string }[];
}

export interface PreviewTemplateResult {
  subject: string;
  html: string;
}

export interface SendTestTemplateResult {
  ok: true;
  smtpAccountId: string;
  messageId?: string;
}

export interface EmailTemplateListItem {
  id: string;
  name: string;
  subject: string;
  smtpAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailTemplateDetail extends EmailTemplateListItem {
  html: string;
  design: unknown;
}

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senders: EmailSenderService,
  ) {}

  async findAll(): Promise<EmailTemplateListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        subject: true,
        smtpAccountId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  async findOne(id: string): Promise<EmailTemplateDetail> {
    this.requireContext();
    const row = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Template no encontrado');
    }
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      smtpAccountId: row.smtpAccountId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      html: row.html,
      design: row.design,
    };
  }

  async create(dto: CreateEmailTemplateDto): Promise<EmailTemplateDetail> {
    const ctx = this.requireContext();

    if (dto.smtpAccountId !== undefined) {
      await this.assertSmtpAccountInScope(dto.smtpAccountId);
    }

    const row = await this.prisma.scoped.emailTemplate.create({
      // organizationId + teamId are injected by the tenant-scope Prisma extension
      data: {
        name: dto.name,
        subject: dto.subject,
        html: dto.html,
        design: dto.design as object,
        ...(dto.smtpAccountId !== undefined && { smtpAccountId: dto.smtpAccountId }),
      } as Prisma.EmailTemplateUncheckedCreateInput,
    });

    this.logger.log(`EmailTemplate created: ${row.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      smtpAccountId: row.smtpAccountId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      html: row.html,
      design: row.design,
    };
  }

  async update(id: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplateDetail> {
    this.requireContext();
    const existing = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Template no encontrado');
    }

    if (dto.smtpAccountId !== undefined && dto.smtpAccountId !== null) {
      await this.assertSmtpAccountInScope(dto.smtpAccountId);
    }

    const row = await this.prisma.scoped.emailTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.html !== undefined && { html: dto.html }),
        ...(dto.design !== undefined && { design: dto.design as object }),
        ...(dto.smtpAccountId !== undefined && { smtpAccountId: dto.smtpAccountId }),
      },
    });

    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      smtpAccountId: row.smtpAccountId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      html: row.html,
      design: row.design,
    };
  }

  async remove(id: string): Promise<void> {
    const ctx = this.requireContext();
    const existing = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Template no encontrado');
    }
    await this.prisma.scoped.emailTemplate.delete({ where: { id } });
    this.logger.log(`EmailTemplate deleted: ${id} from org ${ctx.organizationId} team ${ctx.teamId}`);
  }

  /**
   * Devuelve el catálogo de variables disponibles para interpolar en el
   * template `id`. `base` es el set fijo de identity (firstName/email/...);
   * `custom` se descubre dinámicamente de `EmailContact.data` (JSONB) en
   * campañas previas que usaron este template.
   *
   * El scoping multi-tenant se inyecta vía bind params en el query raw
   * (Postgres-only) porque la tenant-extension solo opera sobre el cliente
   * ORM, no sobre `$queryRaw`.
   */
  async getVariablesCatalog(id: string): Promise<EmailTemplateVariablesCatalog> {
    const ctx = this.requireContext();
    const existing = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Template no encontrado');
    }

    const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
      SELECT DISTINCT jsonb_object_keys(ec.data) AS key
      FROM "EmailContact" ec
      JOIN "EmailCampaign" c ON c.id = ec."campaignId"
      WHERE c."templateId" = ${id}
        AND c."organizationId" = ${ctx.organizationId}
        AND c."teamId" = ${ctx.teamId}
        AND ec.data IS NOT NULL
      LIMIT 500
    `;

    const customKeys = Array.from(
      new Set(
        rows
          .map((r) => r.key)
          .filter((k) => typeof k === 'string' && k.length > 0 && !CONTACT_BASE_VARIABLE_KEYS.has(k)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return {
      base: CONTACT_BASE_VARIABLES,
      custom: customKeys.map((key) => ({ key })),
    };
  }

  async renderPreview(id: string, dto: PreviewTemplateDto): Promise<PreviewTemplateResult> {
    this.requireContext();
    const tpl = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!tpl) {
      throw new NotFoundException('Template no encontrado');
    }
    const vars: Record<string, unknown> = {
      ...buildBaseSampleData(),
      ...(dto.sampleData ?? {}),
    };
    let subject: string;
    let html: string;
    try {
      subject = Handlebars.compile(tpl.subject, { noEscape: false })(vars);
      html = Handlebars.compile(tpl.html, { noEscape: true })(vars);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error compilando template';
      throw new BadRequestException(`Template inválido: ${msg}`);
    }
    return { subject, html };
  }

  async sendTest(id: string, dto: SendTestTemplateDto): Promise<SendTestTemplateResult> {
    const ctx = this.requireContext();
    const tpl = await this.prisma.scoped.emailTemplate.findFirst({ where: { id } });
    if (!tpl) {
      throw new NotFoundException('Template no encontrado');
    }

    // Resolver SMTP: si pasaron uno, validar scope; sino usar primero
    // del team (prioriza isActive=true; tie-break por createdAt asc).
    let smtpId = dto.smtpAccountId ?? tpl.smtpAccountId ?? null;
    if (smtpId) {
      await this.assertSmtpAccountInScope(smtpId);
    } else {
      const fallback = await this.prisma.scoped.smtpAccount.findFirst({
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      });
      if (!fallback) {
        throw new BadRequestException('No hay cuenta SMTP configurada en este team');
      }
      smtpId = fallback.id;
    }

    const account = await this.prisma.scoped.smtpAccount.findFirst({ where: { id: smtpId } });
    if (!account) {
      throw new BadRequestException('La cuenta SMTP indicada no existe en este team');
    }
    if (!account.isActive) {
      throw new BadRequestException('La cuenta SMTP indicada está inactiva');
    }

    const { subject, html } = await this.renderPreview(id, { sampleData: dto.sampleData });

    const result = await this.senders.sendForAccount(
      {
        id: account.id,
        teamId: account.teamId,
        host: account.host,
        port: account.port,
        username: account.username,
        passwordEnc: account.passwordEnc,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        provider: account.provider,
        sesConfigSet: account.sesConfigSet,
        replyTo: account.replyTo,
      },
      { to: dto.toEmail, subject, html },
    );

    this.logger.log(
      `EmailTemplate ${id} test-sent to ${dto.toEmail} via smtp ${account.id} (org ${ctx.organizationId} team ${ctx.teamId})`,
    );
    return { ok: true, smtpAccountId: account.id, messageId: result.messageId };
  }

  private async assertSmtpAccountInScope(smtpAccountId: string): Promise<void> {
    const found = await this.prisma.scoped.smtpAccount.findFirst({ where: { id: smtpAccountId } });
    if (!found) {
      throw new BadRequestException('La cuenta SMTP indicada no existe en este team');
    }
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant');
    }
    return ctx;
  }
}
