import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SMTP_PROVIDERS = ['smtp', 'ses'] as const;
export type SmtpProvider = (typeof SMTP_PROVIDERS)[number];

export class CreateSmtpAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  // host/port/username/password son opcionales: requeridos sólo para
  // provider='smtp' (validación cross-field en el service). Para provider='ses'
  // los rellenamos con placeholders porque el sender SES ignora esos campos
  // (usa SESv2 API con instance profile, no SMTP).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fromName!: string;

  @IsEmail()
  @MaxLength(320)
  fromEmail!: string;

  @IsOptional()
  @IsIn(SMTP_PROVIDERS)
  provider?: SmtpProvider;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sesConfigSet?: string;

  // Si está seteado: backend valida que el EmailDomain (a) sea de esta org,
  // (b) esté VERIFIED, y (c) que `fromEmail` termine en `@<domain>`. Setea
  // `provider='ses'` automáticamente.
  @IsOptional()
  @IsString()
  emailDomainId?: string;
}

export class TestSmtpAccountDto {
  @IsEmail()
  @MaxLength(320)
  to!: string;
}

export class UpdateSmtpAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  fromEmail?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(SMTP_PROVIDERS)
  provider?: SmtpProvider;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sesConfigSet?: string;

  @IsOptional()
  @IsString()
  emailDomainId?: string;
}
