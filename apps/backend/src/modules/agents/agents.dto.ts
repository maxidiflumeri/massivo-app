import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class UpdateAgentConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** "provider/model", ej. anthropic/claude-haiku-4-5-20251001. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxSteps?: number;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class ConnectChannelDto {
  @IsString()
  @IsNotEmpty()
  channelId!: string;
}

export class CreateAgentDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;
}

// ---------------------------------------------------------------------------
// Tools personalizadas (AgentCustomTool)
// ---------------------------------------------------------------------------

export const AGENT_TOOL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Slug que ve el LLM: minúsculas, empieza con letra, snake_case. */
export const AGENT_TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

export class AgentToolHeaderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  key!: string;

  @IsString()
  @MaxLength(4000)
  value!: string;

  @IsOptional()
  @IsBoolean()
  secret?: boolean;
}

export class CreateAgentToolDto {
  @IsString()
  @Matches(AGENT_TOOL_NAME_RE, {
    message: 'name debe ser snake_case: ^[a-z][a-z0-9_]{0,63}$',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;

  /** El routing del LLM: qué hace, cuándo usarla y cuándo NO. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description!: string;

  /** JSON Schema del objeto de argumentos ({ type: "object", properties, ... }). */
  @IsObject()
  parameters!: Record<string, unknown>;

  @IsIn(AGENT_TOOL_METHODS as unknown as string[])
  method!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentToolHeaderDto)
  headers?: AgentToolHeaderDto[];

  @IsOptional()
  bodyTemplate?: unknown;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAgentToolDto {
  @IsOptional()
  @IsString()
  @Matches(AGENT_TOOL_NAME_RE, {
    message: 'name debe ser snake_case: ^[a-z][a-z0-9_]{0,63}$',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsIn(AGENT_TOOL_METHODS as unknown as string[])
  method?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentToolHeaderDto)
  headers?: AgentToolHeaderDto[];

  @IsOptional()
  bodyTemplate?: unknown;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Reemplaza el set completo de tools del agente (semántica PUT, simple). */
export class AssignAgentToolsDto {
  @IsArray()
  @IsString({ each: true })
  toolIds!: string[];
}
