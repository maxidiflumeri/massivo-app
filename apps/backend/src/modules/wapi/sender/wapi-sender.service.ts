import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  META_AUTH_CODES,
  META_RATE_LIMIT_CODES,
  WapiSendException,
  type SendMediaByIdInput,
  type SendMediaInput,
  type SendResult,
  type SendTemplateInput,
  type SendTextInput,
  type WapiSenderConfig,
  type WapiSendError,
} from './wapi-sender.types';

const DEFAULT_API_VERSION = 'v20.0';

interface GraphErrorBody {
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
    type?: string;
    fbtrace_id?: string;
  };
}

interface GraphSendOk {
  messages?: Array<{ id: string }>;
}

/**
 * Cliente HTTP a Graph API `/messages`. Usa fetch nativo (Node 22, undici bundled)
 * para no agregar deps. Una sola instancia por worker — la config (token /
 * phoneNumberId) viene por llamada porque cambia por tenant.
 *
 * Errores de Meta se normalizan en `WapiSendException` con el code original +
 * flags `isRateLimit` / `isAuth` / `retryable` que el worker usa para decidir
 * backoff vs FAILED definitivo.
 */
@Injectable()
export class WapiSenderService {
  private readonly logger = new Logger(WapiSenderService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(cfg: WapiSenderConfig): string {
    const apiBase = this.config.get<string>('WAPI_GRAPH_BASE_URL') ?? 'https://graph.facebook.com';
    const version = cfg.apiVersion ?? DEFAULT_API_VERSION;
    return `${apiBase}/${version}/${cfg.phoneNumberId}/messages`;
  }

  async sendText(cfg: WapiSenderConfig, input: SendTextInput): Promise<SendResult> {
    return this.post(cfg, {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'text',
      text: { body: input.body, preview_url: input.previewUrl ?? false },
    });
  }

  async sendTemplate(cfg: WapiSenderConfig, input: SendTemplateInput): Promise<SendResult> {
    return this.post(cfg, {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(input.components ? { components: input.components } : {}),
      },
    });
  }

  async sendMedia(cfg: WapiSenderConfig, input: SendMediaInput): Promise<SendResult> {
    const media: Record<string, unknown> = { link: input.link };
    if (input.caption) media.caption = input.caption;
    if (input.filename) media.filename = input.filename;
    return this.post(cfg, {
      messaging_product: 'whatsapp',
      to: input.to,
      type: input.type,
      [input.type]: media,
    });
  }

  /**
   * Envío de media usando media_id ya subido (vs `link` público). Es la ruta
   * que usa el inbox: el operador adjunta un archivo, lo subimos a Meta con
   * `WapiMediaService.uploadToMeta`, y acá lo referenciamos por `id`.
   */
  async sendMediaById(cfg: WapiSenderConfig, input: SendMediaByIdInput): Promise<SendResult> {
    const media: Record<string, unknown> = { id: input.mediaId };
    if (input.caption && input.type !== 'audio' && input.type !== 'sticker') {
      media.caption = input.caption;
    }
    if (input.filename && input.type === 'document') {
      media.filename = input.filename;
    }
    return this.post(cfg, {
      messaging_product: 'whatsapp',
      to: input.to,
      type: input.type,
      [input.type]: media,
    });
  }

  private async post(cfg: WapiSenderConfig, body: Record<string, unknown>): Promise<SendResult> {
    if (cfg.isTestMode) {
      const simId = `wamid.SIM_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      this.logger.debug(`[isTestMode] short-circuit phoneNumberId=${cfg.phoneNumberId} → ${simId}`);
      return { metaMessageId: simId, raw: { simulated: true, body } };
    }
    const res = await fetch(this.baseUrl(cfg), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const err = this.normalizeError(res.status, json);
      this.logger.warn(`Graph API ${res.status} code=${err.code ?? 'n/a'}: ${err.message}`);
      throw new WapiSendException(err);
    }
    const ok = json as GraphSendOk;
    const id = ok.messages?.[0]?.id;
    if (!id) {
      throw new WapiSendException({
        code: null,
        subCode: null,
        message: 'Graph 200 sin messages[0].id',
        isRateLimit: false,
        isAuth: false,
        retryable: false,
        raw: json,
      });
    }
    return { metaMessageId: id, raw: json };
  }

  private normalizeError(httpStatus: number, body: unknown): WapiSendError {
    const e = (body as GraphErrorBody).error;
    const code = typeof e?.code === 'number' ? e.code : null;
    const subCode = typeof e?.error_subcode === 'number' ? e.error_subcode : null;
    const message = e?.message ?? `HTTP ${httpStatus}`;
    const isRateLimit =
      (code !== null && META_RATE_LIMIT_CODES.has(code)) || httpStatus === 429;
    const isAuth = code !== null && META_AUTH_CODES.has(code);
    const retryable = isRateLimit || httpStatus >= 500;
    return { code, subCode, message, isRateLimit, isAuth, retryable, raw: body };
  }
}
