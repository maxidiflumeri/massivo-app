import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const SHORTCUT_REGEX = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export class CreateWapiQuickReplyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(40)
  @Matches(SHORTCUT_REGEX, {
    message:
      'shortcut: 1-40 chars, minúsculas / dígitos / "_" o "-", debe empezar con letra o dígito',
  })
  shortcut!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class UpdateWapiQuickReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(SHORTCUT_REGEX, {
    message:
      'shortcut: 1-40 chars, minúsculas / dígitos / "_" o "-", debe empezar con letra o dígito',
  })
  shortcut?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;
}
