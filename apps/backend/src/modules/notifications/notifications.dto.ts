import { IsIn, IsOptional } from 'class-validator';

export const NOTIFICATION_BUCKETS = ['mine', 'unassigned', 'all'] as const;
export type NotificationBucketDto = (typeof NOTIFICATION_BUCKETS)[number];

export class MarkAllReadDto {
  /** Balde a marcar como leído. Default: `all` (mías + sin asignar). */
  @IsOptional()
  @IsIn(NOTIFICATION_BUCKETS as unknown as string[])
  bucket?: NotificationBucketDto;
}
