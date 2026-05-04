import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const REPORT_KINDS = [
  'campaign-summary',
  'campaign-reports',
  'bounces-complaints',
  'suppressions',
] as const;
export const REPORT_FORMATS = ['csv', 'xlsx'] as const;

export class GenerateReportDto {
  @IsIn(REPORT_KINDS)
  kind!: (typeof REPORT_KINDS)[number];

  @IsIn(REPORT_FORMATS)
  format!: (typeof REPORT_FORMATS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;
}
