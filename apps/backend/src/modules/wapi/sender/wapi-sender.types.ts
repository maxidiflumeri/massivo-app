/**
 * Tipos del cliente Graph API. El sender expone una API tipada por encima del
 * payload de Meta para que el worker no tenga que conocer el shape específico.
 */

export interface WapiSenderConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

export interface SendTextInput {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface TemplateComponentParam {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: string;
  parameters?: TemplateComponentParam[];
}

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  components?: TemplateComponent[];
}

export interface SendMediaInput {
  to: string;
  type: 'image' | 'document' | 'video' | 'audio';
  link: string;
  caption?: string;
  filename?: string;
}

export interface SendResult {
  metaMessageId: string;
  raw: unknown;
}

/**
 * Error normalizado del sender. `code` corresponde al code numérico de Meta.
 * `isRateLimit` es true para los códigos conocidos de throttling (131056 /
 * 130429 / 131048) — el worker usa esto para decidir backoff exponencial vs
 * marcar FAILED definitivo.
 */
export interface WapiSendError {
  code: number | null;
  subCode: number | null;
  message: string;
  isRateLimit: boolean;
  isAuth: boolean;
  retryable: boolean;
  raw: unknown;
}

export class WapiSendException extends Error {
  constructor(public readonly detail: WapiSendError) {
    super(detail.message);
    this.name = 'WapiSendException';
  }
}

export const META_RATE_LIMIT_CODES = new Set<number>([130429, 131048, 131056]);
export const META_AUTH_CODES = new Set<number>([190, 102, 10, 200]);
