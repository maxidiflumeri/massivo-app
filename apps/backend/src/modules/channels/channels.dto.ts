import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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

/** Kinds que hoy se pueden dar de alta vía UI (Instagram/Webchat llegan en Fase 3/4). */
export const CREATABLE_CHANNEL_KINDS = ['WHATSAPP', 'MESSENGER'] as const;

export class CreateChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  // Fase 2 (multi-canal). Default WHATSAPP para compat con el alta legacy.
  @IsOptional()
  @IsIn(CREATABLE_CHANNEL_KINDS as unknown as string[])
  kind?: string;

  // WhatsApp: id del número. Requerido para WHATSAPP (validado en el service).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  phoneNumberId?: string;

  // WhatsApp: WABA id. Requerido para WHATSAPP.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessAccountId?: string;

  // Messenger/Instagram: id de la página. Requerido para esos kinds.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pageId?: string;

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

export class UpdateChannelDto {
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
