import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

/**
 * DTO para PATCH /wapi/configs/:id/bot. botFlow se valida estructuralmente en
 * el service via `validateBotFlow` (más rico que decoradores) — acá sólo
 * chequeamos que sea objeto. Pasar null para borrar el flow.
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
}
