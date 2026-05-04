/**
 * Shapes mínimos del payload de Meta WhatsApp Cloud API webhook.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 *
 * El payload completo es bastante más rico (location, reactions, contacts,
 * interactive, button, list_reply, etc.). Persistimos crudo en `WapiMessage.content`
 * y normalizamos `type` para que el inbox pueda renderizar lo que sepa.
 */
export interface WapiWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WapiWebhookEntry[];
}

export interface WapiWebhookEntry {
  id: string; // businessAccountId
  changes: WapiWebhookChange[];
}

export interface WapiWebhookChange {
  field: string; // 'messages' | 'message_template_status_update' | etc.
  value: WapiWebhookValue;
}

export interface WapiWebhookValue {
  messaging_product?: 'whatsapp';
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: WapiWebhookContact[];
  messages?: WapiWebhookMessage[];
  statuses?: WapiWebhookStatus[];
  errors?: unknown[];
}

export interface WapiWebhookContact {
  wa_id: string; // phone sin '+'
  profile?: { name?: string };
}

export interface WapiWebhookMessage {
  id: string;
  from: string; // phone sin '+'
  timestamp: string; // unix seconds
  type: string; // 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'button' | 'interactive' | 'reaction' | 'contacts' | 'location' | ...
  text?: { body: string };
  image?: { id: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id: string; mime_type?: string; sha256?: string };
  video?: { id: string; mime_type?: string; sha256?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type?: string; sha256?: string };
  button?: { payload: string; text: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description?: string } };
  reaction?: { message_id: string; emoji: string };
  context?: { from?: string; id?: string };
}

export interface WapiWebhookStatus {
  id: string; // metaMessageId
  recipient_id: string; // phone destinatario
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type?: string } };
  pricing?: { billable?: boolean; pricing_model?: string; category?: string };
  errors?: { code: number; title: string; message?: string; error_data?: unknown }[];
}
