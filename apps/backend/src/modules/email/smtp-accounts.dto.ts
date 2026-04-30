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

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

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
}
