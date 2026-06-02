import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventLogger } from '../../../common/observability/event-logger.service';
import {
  META_AUTH_CODES,
  META_RATE_LIMIT_CODES,
  WapiSendException,
  type SendInteractiveButtonsInput,
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

  constructor(
    private readonly config: ConfigService,
    private readonly eventLogger: EventLogger,
  ) {}

  private baseUrl(cfg: WapiSenderConfig): string {
    const apiBase = this.config.get<string>('WAPI_GRAPH_BASE_URL') || 'https://graph.facebook.com';
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

  /**
   * Envía un mensaje interactive con quick reply buttons (Meta interactive
   * type=button). Hasta 3 botones — Meta rechaza más. Usado por el bot guiado
   * (4.M) para presentar las opciones de un nodo MENU.
   */
  async sendInteractiveButtons(
    cfg: WapiSenderConfig,
    input: SendInteractiveButtonsInput,
  ): Promise<SendResult> {
    if (!input.buttons || input.buttons.length === 0) {
      throw new Error('sendInteractiveButtons requires at least 1 button');
    }
    if (input.buttons.length > 3) {
      throw new Error('Meta limita interactive buttons a 3 por mensaje');
    }
    const interactive: Record<string, unknown> = {
      type: 'button',
      body: { text: input.body },
      action: {
        buttons: input.buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    };
    if (input.header) interactive.header = { type: 'text', text: input.header };
    if (input.footer) interactive.footer = { text: input.footer };
    return this.post(cfg, {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'interactive',
      interactive,
    });
  }

  private async post(cfg: WapiSenderConfig, body: Record<string, unknown>): Promise<SendResult> {
    const phone = String(body.to ?? '?');
    const type = String(body.type ?? '?');
    const preview = outboundPreview(body);
    const startedAt = Date.now();
    if (cfg.isTestMode) {
      const simId = `wamid.SIM_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      this.logger.debug(`[isTestMode] short-circuit phoneNumberId=${cfg.phoneNumberId} → ${simId}`);
      this.eventLogger.wapiOutbound({
        phone,
        type,
        body: preview,
        success: true,
        durationMs: Date.now() - startedAt,
        metaMessageId: simId,
      });
      return { metaMessageId: simId, raw: { simulated: true, body } };
    }
    let res: Response;
    try {
      res = await fetch(this.baseUrl(cfg), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.eventLogger.wapiOutbound({
        phone,
        type,
        body: preview,
        success: false,
        durationMs: Date.now() - startedAt,
        error: `network: ${(err as Error).message}`,
      });
      throw err;
    }
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const err = this.normalizeError(res.status, json);
      this.logger.warn(`Graph API ${res.status} code=${err.code ?? 'n/a'}: ${err.message}`);
      this.eventLogger.wapiOutbound({
        phone,
        type,
        body: preview,
        success: false,
        durationMs: Date.now() - startedAt,
        error: `${res.status} ${err.code ?? ''} ${err.message}`.trim(),
      });
      throw new WapiSendException(err);
    }
    const ok = json as GraphSendOk;
    const id = ok.messages?.[0]?.id;
    if (!id) {
      this.eventLogger.wapiOutbound({
        phone,
        type,
        body: preview,
        success: false,
        durationMs: Date.now() - startedAt,
        error: 'graph-200-no-id',
      });
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
    this.eventLogger.wapiOutbound({
      phone,
      type,
      body: preview,
      success: true,
      durationMs: Date.now() - startedAt,
      metaMessageId: id,
    });
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

/** 4.R — preview corto del body que vamos a mandar (lo que se ve en Dozzle). */
function outboundPreview(body: Record<string, unknown>): string | undefined {
  const b = body as Record<string, any>;
  if (b.type === 'text') return b.text?.body;
  if (b.type === 'interactive') {
    return b.interactive?.body?.text ?? b.interactive?.action?.button;
  }
  if (b.type === 'template') {
    const tplName = b.template?.name;
    return tplName ? `template:${tplName}` : undefined;
  }
  if (b.type === 'image' || b.type === 'video' || b.type === 'document' || b.type === 'audio') {
    const media = b[b.type as string];
    return media?.caption ?? (media?.filename ? `[${b.type}] ${media.filename}` : `[${b.type}]`);
  }
  return undefined;
}
