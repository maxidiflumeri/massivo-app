import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PHONE_REGEX = /^\+?[0-9]{6,20}$/;

export class CreateWapiCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  configId?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date;
}

export class UpdateWapiCampaignDto {
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
  configId?: string | null;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date | null;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> | null;
}

export class WapiCampaignContactDto {
  @IsString()
  @Matches(PHONE_REGEX, {
    message: 'phone debe ser numérico (E.164 sin separadores), 6-20 dígitos, opcional +',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class AddWapiCampaignContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WapiCampaignContactDto)
  contacts!: WapiCampaignContactDto[];
}
