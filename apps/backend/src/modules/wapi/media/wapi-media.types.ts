/**
 * Tipos para 4.F.2.d (media upload/download Meta).
 *
 * Limites Meta vigentes a v20.0:
 *   image:    5 MB   (image/jpeg, image/png)
 *   audio:   16 MB   (audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg)
 *   video:   16 MB   (video/mp4, video/3gpp)
 *   document:100 MB  (varios)
 *   sticker: 100 KB  (image/webp estático) / 500 KB animado
 *
 * Si Meta cambia los caps, ajustar `MEDIA_LIMITS_BY_TYPE` y revisar la
 * validación del controller.
 */

export type WapiMediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export interface WapiMediaUploadInput {
  configId: string;
  type: WapiMediaType;
  buffer: Buffer;
  mime: string;
  filename: string;
  caption?: string;
}

export interface WapiMediaUploadResult {
  mediaId: string;
  sha256: string;
  size: number;
  localPath: string;
}

export interface WapiMediaDownloadResult {
  sha256: string;
  size: number;
  mime: string;
  localPath: string;
}

export const MEDIA_LIMITS_BY_TYPE: Record<WapiMediaType, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  sticker: 500 * 1024, // Tomamos el cap mayor (animado); validación más estricta queda al editor.
};

export const ALLOWED_MIMES_BY_TYPE: Record<WapiMediaType, ReadonlySet<string>> = {
  image: new Set(['image/jpeg', 'image/png']),
  audio: new Set([
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/amr',
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/webm',
  ]),
  video: new Set(['video/mp4', 'video/3gpp']),
  document: new Set([
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
  ]),
  sticker: new Set(['image/webp']),
};

/**
 * Mapping mime → extension. Usado para nombrar archivos en el storage.
 * Caída a `.bin` si no conocemos la extension (no debería pasar tras validación).
 */
export const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/amr': 'amr',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
};

export function detectTypeFromMime(mime: string): WapiMediaType | null {
  for (const [type, set] of Object.entries(ALLOWED_MIMES_BY_TYPE) as Array<
    [WapiMediaType, ReadonlySet<string>]
  >) {
    if (set.has(mime)) return type;
  }
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

export class WapiMediaException extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_MIME'
      | 'TOO_LARGE'
      | 'META_UPLOAD_FAILED'
      | 'META_FETCH_FAILED'
      | 'IO_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'WapiMediaException';
  }
}
