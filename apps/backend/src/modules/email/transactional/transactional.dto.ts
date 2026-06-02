import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransactionalAttachmentDto {
  /** URL pública del adjunto. SSRF guard valida la IP destino (sin privadas). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  /**
   * Filename como lo verá el destinatario. Si se omite, se sniffea del
   * último segmento del path de la URL o se usa "attachment".
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;
}

export class TransactionalSendDto {
  /** ID del EmailTemplate dentro de la org actual. */
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  /** Destinatario único. Para múltiples destinatarios usar campañas. */
  @IsEmail()
  toEmail!: string;

  /** Variables para interpolar en subject y html (Handlebars). */
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  /**
   * Lista de URLs de adjuntos. Hasta 5 archivos, 5 MB cada uno, 10 MB total
   * (límite de SES raw send).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TransactionalAttachmentDto)
  attachments?: TransactionalAttachmentDto[];

  /**
   * SmtpAccount a usar como sender. Si se omite, cae al `defaultSmtpAccountId`
   * del template (si está seteado).
   */
  @IsOptional()
  @IsString()
  smtpAccountId?: string;
}

const REPORT_STATUSES = ['PENDING', 'SENT', 'FAILED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED'] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

export class ListTransactionalReportsDto {
  /** ISO date inclusive (ej. "2026-06-01"). Default: 7 días atrás. */
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /** ISO date inclusive. Default: hoy. */
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatus;

  /** Filtra por substring del recipient (LIKE %query%). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipient?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 50;
}
