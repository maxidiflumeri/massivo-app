import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateWapiTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  metaName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessAccountId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  status!: string;

  @IsObject()
  components!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  buttonActions?: Record<string, unknown>;
}

export class UpdateWapiTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  metaName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @IsObject()
  components?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  buttonActions?: Record<string, unknown> | null;
}
