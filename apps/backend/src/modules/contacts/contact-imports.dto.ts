import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportContactRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cuit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneE164?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown> | null;
}

export class CreateContactImportDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(0)
  @Max(100 * 1024 * 1024)
  fileSize!: number;

  @IsObject()
  mapping!: Record<string, string>;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => ImportContactRowDto)
  rows!: ImportContactRowDto[];
}

export class ListContactImportsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
