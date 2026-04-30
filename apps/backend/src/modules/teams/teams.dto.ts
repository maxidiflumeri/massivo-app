import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug!: string;
}

export class UpdateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;
}
