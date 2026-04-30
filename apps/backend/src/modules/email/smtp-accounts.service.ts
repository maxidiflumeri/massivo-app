import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@massivo/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { CreateSmtpAccountDto, UpdateSmtpAccountDto } from './smtp-accounts.dto';

export interface SmtpAccountListItem {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  provider: string;
  sesConfigSet: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toListItem(row: {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  provider: string;
  sesConfigSet: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SmtpAccountListItem {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    isActive: row.isActive,
    provider: row.provider,
    sesConfigSet: row.sesConfigSet,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class SmtpAccountsService {
  private readonly logger = new Logger(SmtpAccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SmtpAccountListItem[]> {
    this.requireContext();
    const rows = await this.prisma.scoped.smtpAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toListItem);
  }

  async findOne(id: string): Promise<SmtpAccountListItem> {
    this.requireContext();
    const row = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }
    return toListItem(row);
  }

  async create(dto: CreateSmtpAccountDto): Promise<SmtpAccountListItem> {
    const ctx = this.requireContext();
    const row = await this.prisma.scoped.smtpAccount.create({
      // organizationId + teamId are injected by the tenant-scope Prisma extension
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port,
        username: dto.username,
        passwordEnc: dto.password,
        fromName: dto.fromName,
        fromEmail: dto.fromEmail,
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.sesConfigSet !== undefined && { sesConfigSet: dto.sesConfigSet }),
      } as Prisma.SmtpAccountUncheckedCreateInput,
    });
    this.logger.log(`SmtpAccount created: ${row.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    return toListItem(row);
  }

  async update(id: string, dto: UpdateSmtpAccountDto): Promise<SmtpAccountListItem> {
    this.requireContext();
    const existing = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }

    const row = await this.prisma.scoped.smtpAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.host !== undefined && { host: dto.host }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.password !== undefined && { passwordEnc: dto.password }),
        ...(dto.fromName !== undefined && { fromName: dto.fromName }),
        ...(dto.fromEmail !== undefined && { fromEmail: dto.fromEmail }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.sesConfigSet !== undefined && { sesConfigSet: dto.sesConfigSet }),
      },
    });
    return toListItem(row);
  }

  async remove(id: string): Promise<void> {
    const ctx = this.requireContext();
    const existing = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }
    await this.prisma.scoped.smtpAccount.delete({ where: { id } });
    this.logger.log(`SmtpAccount deleted: ${id} from org ${ctx.organizationId} team ${ctx.teamId}`);
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant');
    }
    return ctx;
  }
}
