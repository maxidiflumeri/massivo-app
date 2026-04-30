import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const UNSUBSCRIBE_SCOPES = ['GLOBAL', 'CAMPAIGN'] as const;
export type UnsubscribeScope = (typeof UNSUBSCRIBE_SCOPES)[number];

export class CreateUnsubscribeDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(UNSUBSCRIBE_SCOPES)
  scope!: UnsubscribeScope;

  @ValidateIf((o: CreateUnsubscribeDto) => o.scope === 'CAMPAIGN')
  @IsString()
  @MaxLength(40)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
