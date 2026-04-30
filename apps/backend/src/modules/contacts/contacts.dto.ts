import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const E164 = /^\+?[1-9]\d{6,14}$/;

export class CreateContactDto {
  @ValidateIf((o: CreateContactDto) => !o.phone)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((o: CreateContactDto) => !o.email)
  @IsString()
  @Matches(E164, { message: 'phone debe estar en formato E.164' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class UpdateContactDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(E164, { message: 'phone debe estar en formato E.164' })
  phone?: string | null;

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

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string | null;
}
