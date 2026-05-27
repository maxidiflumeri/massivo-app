import { triggerBlobDownload, type ApiClient } from '../../../api/client';

export type ContactReportFormat = 'csv' | 'xlsx';

export interface ContactsListReportFilters {
  format: ContactReportFormat;
  q?: string;
  tags?: string[];
  channel?: 'email' | 'wapi';
  hasOpened?: boolean;
  hasClicked?: boolean;
  hasBounced?: boolean;
  sort?: 'createdAt' | 'updatedAt' | 'name';
  direction?: 'asc' | 'desc';
}

export interface ContactActivityReportFilters {
  format: ContactReportFormat;
  dateFrom?: string;
  dateTo?: string;
  channel?: 'email' | 'wapi' | 'audit';
}

export type AggregateGroupBy = 'tag' | 'attribute' | 'externalIdPattern';

export interface AggregatedReportFilters {
  format: ContactReportFormat;
  groupBy: AggregateGroupBy;
  attributeKey?: string;
  externalIdPrefix?: string;
}

/**
 * 5.E — Descarga el reporte "lista de contactos" con los filtros indicados y
 * dispara el save dialog del browser. El filename se toma del header
 * `Content-Disposition` que envía el backend.
 */
export async function downloadContactsListReport(
  api: ApiClient,
  filters: ContactsListReportFilters,
): Promise<void> {
  const file = await api.download(
    '/api/contacts/reports/list',
    filters,
    `contacts-list.${filters.format}`,
  );
  triggerBlobDownload(file);
}

/**
 * 5.E — Descarga el reporte de actividad de un contact (timeline export).
 */
export async function downloadContactActivityReport(
  api: ApiClient,
  contactId: string,
  filters: ContactActivityReportFilters,
): Promise<void> {
  const file = await api.download(
    `/api/contacts/reports/activity/${contactId}`,
    filters,
    `contact-${contactId}-activity.${filters.format}`,
  );
  triggerBlobDownload(file);
}

/**
 * 5.E — Descarga el reporte agregado según groupBy (tag/attribute/externalIdPattern).
 */
export async function downloadAggregatedReport(
  api: ApiClient,
  filters: AggregatedReportFilters,
): Promise<void> {
  const file = await api.download(
    '/api/contacts/reports/aggregated',
    filters,
    `contacts-aggregated.${filters.format}`,
  );
  triggerBlobDownload(file);
}
