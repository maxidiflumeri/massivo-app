import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  ACTIVITY_CHANNELS,
  AGGREGATE_GROUP_BYS,
  CONTACT_REPORT_FORMATS,
  type ActivityChannel,
  type AggregateGroupBy,
  type ContactReportFormat,
} from './contact-reports.types';

function toBoolTransform({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const s = value.toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return undefined;
}

function toArrayTransform({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * 5.E — Lista de contactos con filtros equivalentes a `ContactsService.search`,
 * más `format` (csv|xlsx). Sin cursor/limit: el service hace loop interno con
 * cursor pagination hasta `MAX_LIST_ROWS`.
 */
export class GenerateContactsListReportDto {
  @IsIn(CONTACT_REPORT_FORMATS)
  format!: ContactReportFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(toArrayTransform)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['email', 'wapi'])
  channel?: 'email' | 'wapi';

  @IsOptional()
  @Transform(toBoolTransform)
  @IsBoolean()
  hasOpened?: boolean;

  @IsOptional()
  @Transform(toBoolTransform)
  @IsBoolean()
  hasClicked?: boolean;

  @IsOptional()
  @Transform(toBoolTransform)
  @IsBoolean()
  hasBounced?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'name'])
  sort?: 'createdAt' | 'updatedAt' | 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';
}

/**
 * 5.E — Actividad cronológica de un contact (timeline export). Filtros
 * opcionales `dateFrom`/`dateTo`/`channel`. El service hace loop con cursor
 * sobre `ContactTimelineService.getTimeline` hasta `MAX_ACTIVITY_ROWS` o EOF.
 */
export class GenerateContactsActivityReportDto {
  @IsIn(CONTACT_REPORT_FORMATS)
  format!: ContactReportFormat;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsIn(ACTIVITY_CHANNELS)
  channel?: ActivityChannel;
}

/**
 * 5.E — Agregaciones de contacts por tag, por valor de un attribute específico,
 * o por prefijo de externalId. `attributeKey` requerido si `groupBy='attribute'`;
 * `externalIdPrefix` requerido si `groupBy='externalIdPattern'`.
 */
export class GenerateAggregatedReportDto {
  @IsIn(CONTACT_REPORT_FORMATS)
  format!: ContactReportFormat;

  @IsIn(AGGREGATE_GROUP_BYS)
  groupBy!: AggregateGroupBy;

  @ValidateIf((o: GenerateAggregatedReportDto) => o.groupBy === 'attribute')
  @IsString()
  @MaxLength(120)
  attributeKey?: string;

  @ValidateIf((o: GenerateAggregatedReportDto) => o.groupBy === 'externalIdPattern')
  @IsString()
  @MaxLength(120)
  externalIdPrefix?: string;
}
