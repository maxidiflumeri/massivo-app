import { Type } from 'class-transformer';
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

export class ListWapiConversationsQueryDto {
  @IsOptional()
  @IsIn(INBOX_TABS as unknown as string[])
  tab?: InboxTab;

  @IsOptional()
  @IsString()
  configId?: string;

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
}

export class ListWapiMessagesQueryDto {
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

export class SendWapiInboxTextDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4096)
  body!: string;

  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}

export class AssignWapiConversationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class ResolveWapiConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ReopenWapiConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class MarkReadStateDto {
  @IsBoolean()
  read!: boolean;
}

export const WAPI_INBOX_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
export type WapiInboxMediaType = (typeof WAPI_INBOX_MEDIA_TYPES)[number];

export class SendWapiInboxMediaDto {
  /** Tipo declarado por el cliente. El service revalida con `detectTypeFromMime`. */
  @IsIn(WAPI_INBOX_MEDIA_TYPES as unknown as string[])
  type!: WapiInboxMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;
}
