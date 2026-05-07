import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 4.Q — máximo razonable para el delay (1h). Evita typos catastróficos. */
const MAX_DELAY_MS = 60 * 60 * 1000;

export class CreateWapiConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  phoneNumberId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessAccountId!: string;

  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  webhookVerifyToken!: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  optOutConfirmMessage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optOutKeywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(MAX_DELAY_MS)
  sendDelayMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(MAX_DELAY_MS)
  sendDelayMaxMs?: number;

  @IsOptional()
  @IsBoolean()
  isTestMode?: boolean;
}

export class UpdateWapiConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  webhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  appSecret?: string | null;

  @IsOptional()
  @IsString()
  welcomeMessage?: string | null;

  @IsOptional()
  @IsString()
  optOutConfirmMessage?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  optOutKeywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(MAX_DELAY_MS)
  sendDelayMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(MAX_DELAY_MS)
  sendDelayMaxMs?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isTestMode?: boolean;
}
