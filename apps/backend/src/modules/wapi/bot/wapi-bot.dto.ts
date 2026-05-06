import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

/**
 * DTO para PATCH /wapi/configs/:id/bot. botFlow / botTopics / botRouter se
 * validan estructuralmente en el service via `validateBotFlow` /
 * `validateBotTopics` / `validateBotRouter` (más ricos que decoradores). Acá
 * sólo chequeamos forma básica. Pasar null para borrar.
 */
export class UpdateBotConfigDto {
  @IsOptional()
  @IsBoolean()
  botEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  botSessionTtlMin?: number;

  @IsOptional()
  @IsObject()
  botFlow?: Record<string, unknown> | null;

  // 4.O.1 — multi-tema
  @IsOptional()
  @IsArray()
  botTopics?: unknown[] | null;

  @IsOptional()
  @IsObject()
  botRouter?: Record<string, unknown> | null;
}
