import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export type TemplateHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type TemplateButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export class TemplateHeaderDto {
  @IsIn(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  format!: TemplateHeaderFormat;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  textExamples?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mediaHandle?: string;
}

export class TemplateBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  text!: string;

  @IsOptional()
  @IsArray()
  examples?: string[][];
}

export class TemplateFooterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  text!: string;
}

export class TemplateButtonDto {
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type!: TemplateButtonType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

export class CreateWapiTemplateMetaDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,512}$/, {
    message: 'name debe ser lowercase con [a-z0-9_], 1-512 chars (regla de Meta)',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language!: string;

  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: TemplateCategory;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateHeaderDto)
  header?: TemplateHeaderDto;

  @ValidateNested()
  @Type(() => TemplateBodyDto)
  body!: TemplateBodyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateFooterDto)
  footer?: TemplateFooterDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];
}
