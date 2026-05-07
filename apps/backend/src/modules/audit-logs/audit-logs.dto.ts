import { IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
