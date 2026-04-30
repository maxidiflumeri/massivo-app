import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
  @IsInt()
  @Min(1)
  dailyLimit?: number;
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
  @IsInt()
  @Min(1)
  dailyLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
