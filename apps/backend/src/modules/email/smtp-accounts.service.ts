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
import { appName } from '../../common/app-brand';
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
  emailDomainId: string | null;
  replyTo: string | null;
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
  emailDomainId: string | null;
  replyTo: string | null;
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
    emailDomainId: row.emailDomainId,
    replyTo: row.replyTo,
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
    const normalized = await this.normalizeForSesDomain(dto);
    const created = await this.prisma.scoped.smtpAccount.create({
      // organizationId + teamId are injected by the tenant-scope Prisma extension
      data: {
        name: normalized.name,
        host: normalized.host,
        port: normalized.port,
        username: normalized.username,
        passwordEnc: normalized.password,
        fromName: normalized.fromName,
        fromEmail: normalized.fromEmail,
        isActive: false, // se activa solo si verify pasa
        ...(normalized.provider !== undefined && { provider: normalized.provider }),
        ...(normalized.sesConfigSet !== undefined && { sesConfigSet: normalized.sesConfigSet }),
        ...(normalized.emailDomainId !== undefined && { emailDomainId: normalized.emailDomainId }),
        ...(dto.replyTo !== undefined && { replyTo: dto.replyTo || null }),
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

    // Si el update toca emailDomainId o pasa a provider='ses', revalidar.
    // Para update parcial llenamos los gaps con los valores actuales antes
    // de pasar por normalizeForSesDomain.
    const merged = await this.normalizeForSesDomain({
      ...dto,
      // Defaults desde la row para que la validación funcione con patches parciales.
      name: dto.name ?? existing.name,
      fromName: dto.fromName ?? existing.fromName,
      fromEmail: dto.fromEmail ?? existing.fromEmail,
      provider: (dto.provider ?? (existing.provider as 'smtp' | 'ses')) as 'smtp' | 'ses',
      emailDomainId:
        dto.emailDomainId !== undefined
          ? dto.emailDomainId
          : existing.emailDomainId ?? undefined,
    });

    // isActive es system-controlled (resultado del verify); ignoramos dto.isActive
    const updated = await this.prisma.scoped.smtpAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: merged.name }),
        ...(merged.host !== undefined && { host: merged.host }),
        ...(merged.port !== undefined && { port: merged.port }),
        ...(merged.username !== undefined && { username: merged.username }),
        ...(merged.password !== undefined && { passwordEnc: merged.password }),
        ...(dto.fromName !== undefined && { fromName: merged.fromName }),
        ...(dto.fromEmail !== undefined && { fromEmail: merged.fromEmail }),
        ...(merged.provider !== undefined && { provider: merged.provider }),
        ...(dto.sesConfigSet !== undefined && { sesConfigSet: merged.sesConfigSet }),
        ...(dto.emailDomainId !== undefined && {
          emailDomainId: merged.emailDomainId ?? null,
        }),
        // replyTo: "" → null para desetear; cualquier otro string → setear.
        ...(dto.replyTo !== undefined && { replyTo: dto.replyTo || null }),
      },
    });
    return this.runVerifyAndUpdate(updated);
  }

  /**
   * Validación cross-field para SMTP vs SES + linkeo a EmailDomain:
   *
   *  - **smtp**: requiere host/port/username/password.
   *  - **ses**: NO requiere SMTP creds. Si vino `emailDomainId`, valida que
   *    pertenezca a esta org, esté VERIFIED, y que `fromEmail` termine
   *    en `@<domain>`. Rellena host/port/username/password con placeholders
   *    (el sender SES los ignora — usa SESv2 API con instance profile).
   *
   * Devuelve los campos efectivos a persistir.
   */
  private async normalizeForSesDomain(dto: {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    fromName?: string;
    fromEmail?: string;
    provider?: 'smtp' | 'ses';
    sesConfigSet?: string;
    emailDomainId?: string;
  }): Promise<{
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    fromName: string;
    fromEmail: string;
    provider?: 'smtp' | 'ses';
    sesConfigSet?: string;
    emailDomainId?: string | null;
  }> {
    const ctx = this.requireContext();
    let provider = dto.provider ?? 'smtp';
    let emailDomainId = dto.emailDomainId ?? undefined;

    if (emailDomainId) {
      const domain = await this.prisma.emailDomain.findFirst({
        where: { id: emailDomainId, organizationId: ctx.organizationId },
      });
      if (!domain) {
        throw new BadRequestException(`emailDomainId ${emailDomainId} no encontrado en tu organización.`);
      }
      if (domain.status !== 'VERIFIED') {
        throw new BadRequestException(
          `El dominio ${domain.domain} aún no está verificado (estado: ${domain.status}). Verificalo antes de vincularlo a una cuenta SMTP.`,
        );
      }
      if (!dto.fromEmail) {
        throw new BadRequestException('fromEmail es obligatorio cuando vinculás un dominio verificado.');
      }
      const fromDomain = dto.fromEmail.split('@')[1]?.toLowerCase();
      if (fromDomain !== domain.domain) {
        throw new BadRequestException(
          `El fromEmail "${dto.fromEmail}" no pertenece al dominio verificado "${domain.domain}".`,
        );
      }
      provider = 'ses';
    }

    if (provider === 'smtp') {
      // SMTP: campos requeridos.
      if (!dto.host || !dto.port || !dto.username || !dto.password) {
        throw new BadRequestException(
          'host, port, username y password son obligatorios para provider="smtp".',
        );
      }
      return {
        name: dto.name!,
        host: dto.host,
        port: dto.port,
        username: dto.username,
        password: dto.password,
        fromName: dto.fromName!,
        fromEmail: dto.fromEmail!,
        provider: dto.provider,
        sesConfigSet: dto.sesConfigSet,
        emailDomainId: emailDomainId ?? null,
      };
    }

    // SES: si no vinieron, rellenamos con placeholders. El sender SES no los
    // lee — usa SESv2 con instance profile credentials. Mantenemos los valores
    // del input si el usuario realmente quiere setearlos.
    return {
      name: dto.name!,
      host: dto.host ?? 'ses.api',
      port: dto.port ?? 465,
      username: dto.username ?? 'SES_INSTANCE_PROFILE',
      password: dto.password ?? 'UNUSED',
      fromName: dto.fromName!,
      fromEmail: dto.fromEmail!,
      provider: 'ses',
      sesConfigSet: dto.sesConfigSet,
      emailDomainId: emailDomainId ?? null,
    };
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
          replyTo: account.replyTo,
        },
        {
          to: dto.to,
          subject: `[${appName()}] Test de cuenta SMTP "${account.name}"`,
          html: `<p>Este es un email de prueba enviado desde ${appName()}.</p>
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
    emailDomainId: string | null;
    replyTo: string | null;
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
      replyTo: row.replyTo,
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
