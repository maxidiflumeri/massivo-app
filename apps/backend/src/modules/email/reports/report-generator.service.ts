import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../../common/prisma/prisma.service';

export type ReportFormat = 'csv' | 'xlsx';
export type ReportKind =
  | 'campaign-summary'
  | 'campaign-reports'
  | 'bounces-complaints'
  | 'suppressions';

export interface ReportFilters {
  campaignId?: string;
  status?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface GeneratedReport {
  filename: string;
  mime: string;
  buffer: Buffer;
}

interface Column<T> {
  key: keyof T & string;
  header: string;
  width?: number;
}

const MIME_CSV = 'text/csv; charset=utf-8';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Generadores de reports email exportables a CSV o XLSX.
 *
 * Asume estar dentro de TenantContext.run — todas las queries usan prisma.scoped
 * (la extensión inyecta organizationId+teamId automáticamente).
 *
 * Estrategia: sync (un solo Buffer en memoria). Suficiente hasta ~50k filas.
 * Datasets más grandes irán por BullMQ + S3 en Fase 8 (scheduler).
 */
@Injectable()
export class ReportGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    kind: ReportKind,
    format: ReportFormat,
    filters: ReportFilters = {},
  ): Promise<GeneratedReport> {
    switch (kind) {
      case 'campaign-summary':
        return this.campaignSummary(format, filters);
      case 'campaign-reports':
        return this.campaignReports(format, filters);
      case 'bounces-complaints':
        return this.bouncesComplaints(format, filters);
      case 'suppressions':
        return this.suppressionsSnapshot(format);
    }
  }

  /**
   * Resumen agregado de una campaña: una sola fila con counts por status +
   * eventos (opens/clicks únicos) + ratios.
   */
  private async campaignSummary(
    format: ReportFormat,
    filters: ReportFilters,
  ): Promise<GeneratedReport> {
    const campaignId = requireCampaignId(filters);
    const campaign = await this.prisma.scoped.emailCampaign.findFirst({
      where: { id: campaignId },
      select: { id: true, name: true, status: true, createdAt: true },
    });
    if (!campaign) throw new NotFoundException(`EmailCampaign ${campaignId} not found`);

    const grouped = await this.prisma.scoped.emailReport.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      PENDING: 0,
      SENT: 0,
      FAILED: 0,
      BOUNCED: 0,
      COMPLAINED: 0,
      SUPPRESSED: 0,
      CANCELED: 0,
    };
    for (const g of grouped) counts[g.status] = g._count._all;

    const [uniqueOpens, uniqueClicks] = await Promise.all([
      this.prisma.scoped.emailReport.count({
        where: { campaignId, firstOpenedAt: { not: null } },
      }),
      this.prisma.scoped.emailReport.count({
        where: { campaignId, firstClickedAt: { not: null } },
      }),
    ]);

    const sent = counts.SENT ?? 0;
    const row = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      createdAt: campaign.createdAt.toISOString(),
      pending: counts.PENDING ?? 0,
      sent,
      failed: counts.FAILED ?? 0,
      bounced: counts.BOUNCED ?? 0,
      complained: counts.COMPLAINED ?? 0,
      suppressed: counts.SUPPRESSED ?? 0,
      canceled: counts.CANCELED ?? 0,
      uniqueOpens,
      uniqueClicks,
      openRate: rate(uniqueOpens, sent),
      clickRate: rate(uniqueClicks, sent),
    };

    const cols: Column<typeof row>[] = [
      { key: 'campaignId', header: 'Campaign ID', width: 28 },
      { key: 'campaignName', header: 'Nombre', width: 32 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'createdAt', header: 'Creada', width: 22 },
      { key: 'pending', header: 'Pendientes' },
      { key: 'sent', header: 'Enviados' },
      { key: 'failed', header: 'Fallidos' },
      { key: 'bounced', header: 'Bounced' },
      { key: 'complained', header: 'Complaints' },
      { key: 'suppressed', header: 'Suprimidos' },
      { key: 'canceled', header: 'Cancelados' },
      { key: 'uniqueOpens', header: 'Aperturas únicas' },
      { key: 'uniqueClicks', header: 'Clicks únicos' },
      { key: 'openRate', header: 'Open rate' },
      { key: 'clickRate', header: 'Click rate' },
    ];

    return this.serialize(format, cols, [row], `campaign-${campaign.id}-summary`);
  }

  /**
   * Detalle por contacto de una campaña: un row por EmailReport, con email,
   * status, sentAt, primer open/click, count de events, error.
   */
  private async campaignReports(
    format: ReportFormat,
    filters: ReportFilters,
  ): Promise<GeneratedReport> {
    const campaignId = requireCampaignId(filters);
    const campaign = await this.prisma.scoped.emailCampaign.findFirst({
      where: { id: campaignId },
      select: { id: true, name: true },
    });
    if (!campaign) throw new NotFoundException(`EmailCampaign ${campaignId} not found`);

    const where: Record<string, unknown> = { campaignId };
    if (filters.status) where.status = filters.status;

    const reports = await this.prisma.scoped.emailReport.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstOpenedAt: true,
        firstClickedAt: true,
        smtpMessageId: true,
        error: true,
        contact: { select: { email: true, name: true } },
        recipientEmail: true,
        _count: { select: { events: true } },
      },
    });

    const rows = reports.map((r) => ({
      reportId: r.id,
      email: r.contact?.email ?? r.recipientEmail ?? '',
      contactName: r.contact?.name ?? '',
      status: r.status,
      sentAt: r.sentAt?.toISOString() ?? '',
      firstOpenedAt: r.firstOpenedAt?.toISOString() ?? '',
      firstClickedAt: r.firstClickedAt?.toISOString() ?? '',
      events: r._count.events,
      smtpMessageId: r.smtpMessageId ?? '',
      error: r.error ?? '',
    }));

    const cols: Column<(typeof rows)[number]>[] = [
      { key: 'reportId', header: 'Report ID', width: 28 },
      { key: 'email', header: 'Email', width: 32 },
      { key: 'contactName', header: 'Nombre', width: 24 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'sentAt', header: 'Enviado', width: 22 },
      { key: 'firstOpenedAt', header: '1ª apertura', width: 22 },
      { key: 'firstClickedAt', header: '1er click', width: 22 },
      { key: 'events', header: 'Eventos' },
      { key: 'smtpMessageId', header: 'Message ID', width: 36 },
      { key: 'error', header: 'Error', width: 40 },
    ];

    return this.serialize(format, cols, rows, `campaign-${campaign.id}-reports`);
  }

  /**
   * Bounces + Complaints en un rango (default últimos 30 días).
   * Usa EmailBounce; los complaints quedan reflejados en EmailReport.status=COMPLAINED
   * — incluimos ambos en una sola hoja con una columna "tipo".
   */
  private async bouncesComplaints(
    format: ReportFormat,
    filters: ReportFilters,
  ): Promise<GeneratedReport> {
    const to = filters.toDate ?? new Date();
    const from = filters.fromDate ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const bounces = await this.prisma.scoped.emailBounce.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        email: true,
        code: true,
        description: true,
        occurredAt: true,
        smtpMessageId: true,
        report: { select: { campaignId: true } },
      },
    });

    const complaints = await this.prisma.scoped.emailReport.findMany({
      where: { status: 'COMPLAINED', updatedAt: { gte: from, lte: to } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        updatedAt: true,
        smtpMessageId: true,
        campaignId: true,
        contact: { select: { email: true } },
        recipientEmail: true,
      },
    });

    const rows: Array<{
      type: string;
      email: string;
      occurredAt: string;
      campaignId: string;
      code: string;
      description: string;
      smtpMessageId: string;
    }> = [];
    for (const b of bounces) {
      rows.push({
        type: 'BOUNCE',
        email: b.email ?? '',
        occurredAt: b.occurredAt.toISOString(),
        campaignId: b.report?.campaignId ?? '',
        code: b.code ?? '',
        description: b.description ?? '',
        smtpMessageId: b.smtpMessageId ?? '',
      });
    }
    for (const c of complaints) {
      rows.push({
        type: 'COMPLAINT',
        email: c.contact?.email ?? c.recipientEmail ?? '',
        occurredAt: c.updatedAt.toISOString(),
        campaignId: c.campaignId ?? '',
        code: '',
        description: '',
        smtpMessageId: c.smtpMessageId ?? '',
      });
    }
    rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    const cols: Column<(typeof rows)[number]>[] = [
      { key: 'type', header: 'Tipo', width: 12 },
      { key: 'email', header: 'Email', width: 32 },
      { key: 'occurredAt', header: 'Fecha', width: 22 },
      { key: 'campaignId', header: 'Campaign ID', width: 28 },
      { key: 'code', header: 'Código', width: 12 },
      { key: 'description', header: 'Descripción', width: 40 },
      { key: 'smtpMessageId', header: 'Message ID', width: 36 },
    ];

    const slug = formatRangeSlug(from, to);
    return this.serialize(format, cols, rows, `bounces-complaints-${slug}`);
  }

  /**
   * Snapshot completo de unsubscribes activos del team.
   */
  private async suppressionsSnapshot(format: ReportFormat): Promise<GeneratedReport> {
    const unsubs = await this.prisma.scoped.emailUnsubscribe.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        scope: true,
        campaignId: true,
        reason: true,
        source: true,
        createdAt: true,
      },
    });

    const rows = unsubs.map((u) => ({
      email: u.email,
      scope: u.scope,
      campaignId: u.campaignId ?? '',
      reason: u.reason ?? '',
      source: u.source ?? '',
      createdAt: u.createdAt.toISOString(),
    }));

    const cols: Column<(typeof rows)[number]>[] = [
      { key: 'email', header: 'Email', width: 32 },
      { key: 'scope', header: 'Alcance', width: 12 },
      { key: 'campaignId', header: 'Campaign ID', width: 28 },
      { key: 'reason', header: 'Motivo', width: 30 },
      { key: 'source', header: 'Origen', width: 16 },
      { key: 'createdAt', header: 'Fecha', width: 22 },
    ];

    return this.serialize(format, cols, rows, 'suppressions-snapshot');
  }

  private async serialize<T extends Record<string, unknown>>(
    format: ReportFormat,
    cols: Column<T>[],
    rows: T[],
    baseFilename: string,
  ): Promise<GeneratedReport> {
    const filename = `${baseFilename}.${format}`;
    if (format === 'csv') {
      const header = cols.map((c) => c.header);
      const data = rows.map((r) => cols.map((c) => r[c.key] ?? ''));
      const csv = stringify([header, ...data], { quoted_string: true });
      return { filename, mime: MIME_CSV, buffer: Buffer.from(csv, 'utf8') };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Reporte');
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    for (const r of rows) ws.addRow(r);
    if (rows.length > 0) {
      ws.getRow(1).font = { bold: true };
    }
    const ab = await wb.xlsx.writeBuffer();
    return { filename, mime: MIME_XLSX, buffer: Buffer.from(ab) };
  }
}

function requireCampaignId(filters: ReportFilters): string {
  if (!filters.campaignId) {
    throw new BadRequestException('campaignId requerido para este reporte');
  }
  return filters.campaignId;
}

function rate(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 10000) / 10000;
}

function formatRangeSlug(from: Date, to: Date): string {
  return `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
}
