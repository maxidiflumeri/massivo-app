import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'audit_metadata';

/**
 * Fuente del `resourceId` para el audit log de un endpoint.
 *
 * Formatos:
 *   - `'param:<key>'` — toma `req.params[<key>]`. Usar para PATCH/DELETE/:id/send.
 *   - `'body:<key>'` — toma `req.body[<key>]`. Usar cuando el id viene en el body.
 *   - `'response:<key>'` — toma el campo del objeto de respuesta. Usar para create.
 */
export type AuditResourceIdSource = `param:${string}` | `body:${string}` | `response:${string}`;

export interface AuditOptions {
  action: string;
  resourceType?: string;
  resourceIdFrom?: AuditResourceIdSource;
  /**
   * Si `true`, incluye `req.body` (sanitizado) en el `metadata` persistido.
   * Default `true`. Apagar para endpoints con bodies grandes (ej. media upload).
   */
  includeBody?: boolean;
}

/**
 * 4.S.1 — Marca un endpoint como auditable. El `AuditInterceptor` lee esta
 * metadata, deja correr el handler, y si terminó OK escribe una fila en
 * `AuditLog` con actor + tenant + IP + UA.
 *
 * Ejemplo:
 *   @Post()
 *   @Audit({ action: 'wapi.campaign.created', resourceType: 'WapiCampaign', resourceIdFrom: 'response:id' })
 *   create(@Body() dto: CreateWapiCampaignDto) { ... }
 */
export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA_KEY, options);
