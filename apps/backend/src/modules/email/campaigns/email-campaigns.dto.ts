import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateEmailCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  smtpAccountId?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date;

  // Override del Reply-To del SmtpAccount para esta campaña. Si null/undefined,
  // el worker cae al account default.
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  replyTo?: string;
}

export class UpdateEmailCampaignDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  templateId?: string | null;

  @IsOptional()
  @IsString()
  smtpAccountId?: string | null;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date | null;

  // Pasar "" para desetear (volver al default del SmtpAccount).
  @IsOptional()
  @IsString()
  @MaxLength(320)
  replyTo?: string;
}

export class CampaignContactDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cuit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class AddCampaignContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CampaignContactDto)
  contacts!: CampaignContactDto[];
}
