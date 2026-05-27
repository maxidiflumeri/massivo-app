/**
 * 5.E — Tipos compartidos de los reportes consolidados de contacts.
 */

export const CONTACT_REPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ContactReportFormat = (typeof CONTACT_REPORT_FORMATS)[number];

export const CONTACT_REPORT_KINDS = ['list', 'activity', 'aggregated'] as const;
export type ContactReportKind = (typeof CONTACT_REPORT_KINDS)[number];

export const AGGREGATE_GROUP_BYS = ['tag', 'attribute', 'externalIdPattern'] as const;
export type AggregateGroupBy = (typeof AGGREGATE_GROUP_BYS)[number];

export const ACTIVITY_CHANNELS = ['email', 'wapi', 'audit'] as const;
export type ActivityChannel = (typeof ACTIVITY_CHANNELS)[number];

export interface GeneratedContactReport {
  filename: string;
  mime: string;
  buffer: Buffer;
}
