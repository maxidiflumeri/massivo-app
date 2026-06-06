import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const INBOX_TABS = ['mine', 'unassigned', 'others', 'resolved', 'all'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(INBOX_TABS as unknown as string[])
  tab?: InboxTab;

  // Filtro por canal puntual (una línea/Channel). Multi-canal: el id de Channel.
  @IsOptional()
  @IsString()
  channelId?: string;

  // Filtro por tipo de canal (WHATSAPP/INSTAGRAM/…). Se enciende en la UI cuando
  // hay más de un kind; con un solo canal queda dormido.
  @IsOptional()
  @IsString()
  channelKind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Filtro Priorizadas (4.K) — query string `priority=true`
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  priority?: boolean;

  // Incluir conversaciones manejadas por el bot (escalated=false). Por defecto el
  // inbox las oculta (4.O.6); el Chat simulado de dev lo activa para poder ver la
  // conversación + respuestas del bot aunque no haya HANDOFF.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeBotHandled?: boolean;
}

export class ListMessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SendInboxTextDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4096)
  body!: string;

  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}

export class AssignConversationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class ResolveConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ReopenConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class MarkReadStateDto {
  @IsBoolean()
  read!: boolean;
}

export const INBOX_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
export type InboxMediaType = (typeof INBOX_MEDIA_TYPES)[number];

export class SendInboxMediaDto {
  /** Tipo declarado por el cliente. El service revalida con `detectTypeFromMime`. */
  @IsIn(INBOX_MEDIA_TYPES as unknown as string[])
  type!: InboxMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}
