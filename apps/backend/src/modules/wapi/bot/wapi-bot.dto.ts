import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

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

  // 4.O.4 — variables declarativas
  @IsOptional()
  @IsArray()
  botVariables?: unknown[] | null;
}

/**
 * 4.O.3 — DTO para PATCH /wapi/configs/:id/bot/draft. Persiste topics+router
 * en columnas separadas (`botTopicsDraft` / `botRouterDraft`) sin tocar prod.
 * El editor visual escribe acá; recién al hacer publish se copia a las
 * columnas activas que usa el motor.
 */
export class SaveBotDraftDto {
  @IsOptional()
  @IsArray()
  botTopics?: unknown[] | null;

  @IsOptional()
  @IsObject()
  botRouter?: Record<string, unknown> | null;

  // 4.O.4 — variables del draft.
  @IsOptional()
  @IsArray()
  botVariables?: unknown[] | null;
}

/**
 * 4.O.3 — DTO para POST /wapi/configs/:id/bot/sandbox/step. Cliente virtual
 * del simulador (no se manda nada a Meta). Ver `WapiBotSandboxService.step`.
 */
export class SandboxStepDto {
  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;

  @IsOptional()
  @IsBoolean()
  resetOnly?: boolean;

  @IsOptional()
  @IsIn(['draft', 'published'])
  source?: 'draft' | 'published';

  /** 4.N.3 — Modo del executor HTTP para este step. Default 'mock'. */
  @IsOptional()
  @IsIn(['mock', 'real'])
  httpMode?: 'mock' | 'real';

  @IsOptional()
  @IsObject()
  inbound?:
    | { kind: 'text'; body: string }
    | { kind: 'button'; buttonId: string }
    | { kind: 'template-payload'; payload: string };
}
