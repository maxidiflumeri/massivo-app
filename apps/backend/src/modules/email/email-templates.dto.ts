import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  html!: string;

  @IsObject()
  design!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  smtpAccountId?: string;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  html?: string;

  @IsOptional()
  @IsObject()
  design?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  smtpAccountId?: string | null;
}

export class PreviewTemplateDto {
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, unknown>;
}

export class SendTestTemplateDto {
  @IsEmail()
  toEmail!: string;

  @IsOptional()
  @IsObject()
  sampleData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  smtpAccountId?: string;
}
