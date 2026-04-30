import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './email-templates.dto';

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

  constructor(private readonly prisma: PrismaService) {}

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
