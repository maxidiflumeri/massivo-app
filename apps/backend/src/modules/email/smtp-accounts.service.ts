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
import { EmailSenderService } from './sender/email-sender.service';
import type {
  CreateSmtpAccountDto,
  TestSmtpAccountDto,
  UpdateSmtpAccountDto,
} from './smtp-accounts.dto';

export interface SmtpAccountVerifyResult {
  ok: boolean;
  error?: string;
}

export interface SmtpAccountWithVerify {
  account: SmtpAccountListItem;
  verify: SmtpAccountVerifyResult;
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly senderService: EmailSenderService,
  ) {}

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

  async create(dto: CreateSmtpAccountDto): Promise<SmtpAccountWithVerify> {
    const ctx = this.requireContext();
    const created = await this.prisma.scoped.smtpAccount.create({
      // organizationId + teamId are injected by the tenant-scope Prisma extension
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port,
        username: dto.username,
        passwordEnc: dto.password,
        fromName: dto.fromName,
        fromEmail: dto.fromEmail,
        isActive: false, // se activa solo si verify pasa
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.sesConfigSet !== undefined && { sesConfigSet: dto.sesConfigSet }),
      } as Prisma.SmtpAccountUncheckedCreateInput,
    });
    this.logger.log(`SmtpAccount created: ${created.id} in org ${ctx.organizationId} team ${ctx.teamId}`);
    const final = await this.runVerifyAndUpdate(created);
    return final;
  }

  async update(id: string, dto: UpdateSmtpAccountDto): Promise<SmtpAccountWithVerify> {
    this.requireContext();
    const existing = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }

    // isActive es system-controlled (resultado del verify); ignoramos dto.isActive
    const updated = await this.prisma.scoped.smtpAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.host !== undefined && { host: dto.host }),
        ...(dto.port !== undefined && { port: dto.port }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.password !== undefined && { passwordEnc: dto.password }),
        ...(dto.fromName !== undefined && { fromName: dto.fromName }),
        ...(dto.fromEmail !== undefined && { fromEmail: dto.fromEmail }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.sesConfigSet !== undefined && { sesConfigSet: dto.sesConfigSet }),
      },
    });
    return this.runVerifyAndUpdate(updated);
  }

  async verify(id: string): Promise<SmtpAccountWithVerify> {
    this.requireContext();
    const existing = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }
    return this.runVerifyAndUpdate(existing);
  }

  async testSend(
    id: string,
    dto: TestSmtpAccountDto,
  ): Promise<{ ok: true; messageId: string | null }> {
    const ctx = this.requireContext();
    const account = await this.prisma.scoped.smtpAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Cuenta SMTP no encontrada');
    }
    if (!account.isActive) {
      throw new BadRequestException('La cuenta SMTP está deshabilitada');
    }
    try {
      const result = await this.senderService.sendForAccount(
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
        },
        {
          to: dto.to,
          subject: `[Massivo] Test de cuenta SMTP "${account.name}"`,
          html: `<p>Este es un email de prueba enviado desde Massivo App.</p>
<p>Si lo recibiste, la cuenta <strong>${escapeHtml(account.name)}</strong> está configurada correctamente.</p>
<p>—<br/>Enviado por: ${escapeHtml(account.fromName)} &lt;${escapeHtml(account.fromEmail)}&gt;</p>`,
        },
      );
      this.logger.log(
        `SmtpAccount test send OK: ${id} → ${dto.to} (org ${ctx.organizationId} team ${ctx.teamId})`,
      );
      return { ok: true, messageId: result.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SmtpAccount test send FAILED: ${id} → ${dto.to}: ${message}`);
      throw new BadRequestException(`Falló el envío de prueba: ${message}`);
    }
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

  private async runVerifyAndUpdate(row: {
    id: string;
    name: string;
    teamId: string;
    host: string;
    port: number;
    username: string;
    passwordEnc: string;
    fromName: string;
    fromEmail: string;
    provider: string;
    sesConfigSet: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<SmtpAccountWithVerify> {
    const verify = await this.senderService.verifyAccount({
      id: row.id,
      teamId: row.teamId,
      host: row.host,
      port: row.port,
      username: row.username,
      passwordEnc: row.passwordEnc,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      provider: row.provider,
      sesConfigSet: row.sesConfigSet,
    });

    const desiredActive = verify.ok;
    let finalRow = row;
    if (row.isActive !== desiredActive) {
      finalRow = await this.prisma.scoped.smtpAccount.update({
        where: { id: row.id },
        data: { isActive: desiredActive },
      });
    }

    if (verify.ok) {
      this.logger.log(`SmtpAccount verified OK: ${row.id} (active=true)`);
      return { account: toListItem(finalRow), verify: { ok: true } };
    }
    this.logger.warn(`SmtpAccount verify FAILED: ${row.id}: ${verify.error}`);
    return { account: toListItem(finalRow), verify: { ok: false, error: verify.error } };
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant');
    }
    return ctx;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
