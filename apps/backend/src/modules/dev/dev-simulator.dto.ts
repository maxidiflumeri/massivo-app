import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PHONE_REGEX = /^[1-9]\d{6,14}$/;

export class SimulateInboundTextDto {
  @IsString()
  @IsNotEmpty()
  configId!: string;

  @IsString()
  @Matches(PHONE_REGEX, { message: 'fromPhone debe ser E.164 sin "+" (ej: 5491155551234)' })
  fromPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body!: string;
}

export const SIMULATE_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
export type SimulateMediaType = (typeof SIMULATE_MEDIA_TYPES)[number];

export class SimulateInboundMediaDto {
  @IsString()
  @IsNotEmpty()
  configId!: string;

  @IsString()
  @Matches(PHONE_REGEX, { message: 'fromPhone debe ser E.164 sin "+"' })
  fromPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsIn(SIMULATE_MEDIA_TYPES as unknown as string[])
  type!: SimulateMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}

export class SimulateInboundReactionDto {
  @IsString()
  @IsNotEmpty()
  configId!: string;

  @IsString()
  @Matches(PHONE_REGEX, { message: 'fromPhone debe ser E.164 sin "+"' })
  fromPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsString()
  @IsNotEmpty()
  targetMetaMessageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

export const SIMULATE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const;
export type SimulateStatus = (typeof SIMULATE_STATUSES)[number];

export class SimulateStatusDto {
  @IsString()
  @IsNotEmpty()
  configId!: string;

  @IsString()
  @IsNotEmpty()
  metaMessageId!: string;

  @IsString()
  @Matches(PHONE_REGEX, { message: 'recipientPhone debe ser E.164 sin "+"' })
  recipientPhone!: string;

  @IsIn(SIMULATE_STATUSES as unknown as string[])
  status!: SimulateStatus;
}
