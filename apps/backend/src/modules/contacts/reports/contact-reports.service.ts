import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { ContactsService, type ContactDto } from '../contacts.service';
import { ContactTimelineService, type TimelineItem } from '../contact-timeline.service';
import type {
  GenerateAggregatedReportDto,
  GenerateContactsActivityReportDto,
  GenerateContactsListReportDto,
} from './contact-reports.dto';
import type {
  ContactReportFormat,
  ContactReportKind,
  GeneratedContactReport,
} from './contact-reports.types';

const MIME_CSV = 'text/csv; charset=utf-8';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PAGE_SIZE_LIST = 200; // limit per ContactsService.search page
const PAGE_SIZE_TIMELINE = 100; // limit per ContactTimelineService.getTimeline page

export const MAX_LIST_ROWS = 50_000;
export const MAX_ACTIVITY_ROWS = 10_000;
export const MAX_AGGREGATED_GROUPS = 5_000;

interface Column {
  key: string;
  header: string;
  width?: number;
}

/**
 * 5.E — Reportes consolidados de contacts: lista, actividad y agregados.
 *
 * Asume estar dentro de TenantContext.run — todas las queries usan prisma.scoped
 * (la extensión inyecta organizationId+teamId automáticamente).
 *
 * Estrategia: sync (un solo Buffer en memoria). Caps explícitos por reporte
 * para mantener memoria acotada. Datasets más grandes irán por BullMQ + S3 en
 * la Fase 8 (scheduler genérico).
 */
@Injectable()
export class ContactReportsService {
  private readonly logger = new Logger(ContactReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly timeline: ContactTimelineService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Genera el reporte "lista de contactos" con filtros equivalentes a
   * ContactsService.search. Loop interno con cursor pagination hasta
   * MAX_LIST_ROWS. Joinea tags + counts de identities por contacto.
   */
  async generateList(
    dto: GenerateContactsListReportDto,
  ): Promise<GeneratedContactReport> {
    this.requireContext();

    const contacts = await this.fetchAllContacts(dto);
    const rows = await this.enrichListRows(contacts);

    const cols: Column[] = [
      { key: 'id', header: 'ID', width: 28 },
      { key: 'externalId', header: 'External ID', width: 24 },
      { key: 'dni', header: 'DNI', width: 14 },
      { key: 'cuit', header: 'CUIT', width: 16 },
      { key: 'email', header: 'Email', width: 32 },
      { key: 'phoneE164', header: 'Teléfono E.164', width: 18 },
      { key: 'firstName', header: 'Nombre', width: 18 },
      { key: 'lastName', header: 'Apellido', width: 18 },
      { key: 'tagsLabels', header: 'Tags', width: 28 },
      { key: 'emailCount', header: 'Identidades email', width: 14 },
      { key: 'wapiCount', header: 'Identidades WAPI', width: 14 },
      { key: 'createdAt', header: 'Creado', width: 22 },
      { key: 'updatedAt', header: 'Actualizado', width: 22 },
    ];

    const filename = `contacts-list-${todaySlug()}.${dto.format}`;
    const report = await this.serialize(dto.format, cols, rows, filename, 'Contactos');

    await this.auditLog.log({
      action: 'contacts.report.generated',
      resourceType: 'Contact',
      metadata: {
        kind: 'list' satisfies ContactReportKind,
        format: dto.format,
        rowCount: rows.length,
        filterSummary: this.summarizeListFilters(dto),
      },
    });

    return report;
  }

  /**
   * Genera el reporte "actividad por contacto" (timeline export). Loop interno
   * con cursor sobre ContactTimelineService.getTimeline hasta MAX_ACTIVITY_ROWS.
   * Filtra por dateFrom/dateTo en memoria.
   */
  async generateActivity(
    contactId: string,
    dto: GenerateContactsActivityReportDto,
  ): Promise<GeneratedContactReport> {
    this.requireContext();

    const contact = await this.prisma.scoped.contact.findFirst({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact no encontrado');

    const items = await this.fetchTimelineItems(contactId, dto);
    const rows = items.map((it) => this.activityRow(it));

    const cols: Column[] = [
      { key: 'at', header: 'Fecha', width: 22 },
      { key: 'channel', header: 'Canal', width: 10 },
      { key: 'kind', header: 'Tipo', width: 22 },
      { key: 'subject', header: 'Asunto', width: 32 },
      { key: 'campaignName', header: 'Campaña', width: 24 },
      { key: 'error', header: 'Error', width: 32 },
      { key: 'direction', header: 'Dirección', width: 12 },
      { key: 'metadata', header: 'Metadata', width: 40 },
    ];

    const filename = `contact-${contactId}-activity-${todaySlug()}.${dto.format}`;
    const report = await this.serialize(dto.format, cols, rows, filename, 'Actividad');

    await this.auditLog.log({
      action: 'contacts.report.generated',
      resourceType: 'Contact',
      resourceId: contactId,
      metadata: {
        kind: 'activity' satisfies ContactReportKind,
        format: dto.format,
        rowCount: rows.length,
        filterSummary: {
          dateFrom: dto.dateFrom?.toISOString() ?? null,
          dateTo: dto.dateTo?.toISOString() ?? null,
          channel: dto.channel ?? null,
        },
      },
    });

    return report;
  }

  /**
   * Genera el reporte agregado según groupBy. Pivot opcional por tag, por valor
   * de un attribute específico, o por prefijo de externalId.
   */
  async generateAggregated(
    dto: GenerateAggregatedReportDto,
  ): Promise<GeneratedContactReport> {
    this.requireContext();

    let rows: Record<string, unknown>[];
    let cols: Column[];
    let sheetName: string;

    switch (dto.groupBy) {
      case 'tag': {
        rows = await this.aggregateByTag();
        cols = [
          { key: 'tagId', header: 'Tag ID', width: 28 },
          { key: 'tagName', header: 'Tag', width: 24 },
          { key: 'contactCount', header: 'Contactos', width: 12 },
          { key: 'emailContactCount', header: 'Con identidad email', width: 18 },
          { key: 'wapiContactCount', header: 'Con identidad WAPI', width: 18 },
        ];
        sheetName = 'Por tag';
        break;
      }
      case 'attribute': {
        if (!dto.attributeKey || !dto.attributeKey.trim()) {
          throw new BadRequestException(
            'attributeKey requerido cuando groupBy=attribute',
          );
        }
        rows = await this.aggregateByAttribute(dto.attributeKey.trim());
        cols = [
          { key: 'attributeKey', header: 'Atributo', width: 24 },
          { key: 'attributeValue', header: 'Valor', width: 28 },
          { key: 'contactCount', header: 'Contactos', width: 12 },
        ];
        sheetName = 'Por atributo';
        break;
      }
      case 'externalIdPattern': {
        if (!dto.externalIdPrefix || !dto.externalIdPrefix.trim()) {
          throw new BadRequestException(
            'externalIdPrefix requerido cuando groupBy=externalIdPattern',
          );
        }
        rows = await this.aggregateByExternalIdPrefix(dto.externalIdPrefix.trim());
        cols = [
          { key: 'externalIdPrefix', header: 'Prefijo externalId', width: 24 },
          { key: 'contactCount', header: 'Contactos', width: 12 },
          { key: 'emailContactCount', header: 'Con identidad email', width: 18 },
          { key: 'wapiContactCount', header: 'Con identidad WAPI', width: 18 },
        ];
        sheetName = 'Por externalId';
        break;
      }
    }

    const filename = `contacts-aggregated-by-${dto.groupBy}-${todaySlug()}.${dto.format}`;
    const report = await this.serialize(dto.format, cols, rows, filename, sheetName);

    await this.auditLog.log({
      action: 'contacts.report.generated',
      resourceType: 'Contact',
      metadata: {
        kind: 'aggregated' satisfies ContactReportKind,
        format: dto.format,
        rowCount: rows.length,
        filterSummary: {
          groupBy: dto.groupBy,
          attributeKey: dto.attributeKey ?? null,
          externalIdPrefix: dto.externalIdPrefix ?? null,
        },
      },
    });

    return report;
  }

  // ─── fetchers ────────────────────────────────────────────────────────────

  private async fetchAllContacts(
    dto: GenerateContactsListReportDto,
  ): Promise<ContactDto[]> {
    const all: ContactDto[] = [];
    let cursor: string | null = null;
    // Loop con cursor pagination hasta MAX_LIST_ROWS o se acabe el dataset.
    while (all.length < MAX_LIST_ROWS) {
      const remaining = MAX_LIST_ROWS - all.length;
      const limit = Math.min(PAGE_SIZE_LIST, remaining);
      const page = await this.contacts.search({
        q: dto.q,
        tags: dto.tags,
        channel: dto.channel,
        hasOpened: dto.hasOpened,
        hasClicked: dto.hasClicked,
        hasBounced: dto.hasBounced,
        sort: dto.sort,
        direction: dto.direction,
        limit,
        cursor: cursor ?? undefined,
      });
      all.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return all;
  }

  private async fetchTimelineItems(
    contactId: string,
    dto: GenerateContactsActivityReportDto,
  ): Promise<TimelineItem[]> {
    const all: TimelineItem[] = [];
    let cursor: string | null = null;
    while (all.length < MAX_ACTIVITY_ROWS) {
      const remaining = MAX_ACTIVITY_ROWS - all.length;
      const limit = Math.min(PAGE_SIZE_TIMELINE, remaining);
      const page = await this.timeline.getTimeline(contactId, {
        cursor: cursor ?? undefined,
        limit,
        channel: dto.channel,
      });
      all.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    // Filtro en memoria por rango de fechas.
    const from = dto.dateFrom ?? null;
    const to = dto.dateTo ?? null;
    if (!from && !to) return all;
    return all.filter((it) => {
      const t = it.at instanceof Date ? it.at : new Date(it.at);
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }

  // ─── row builders ────────────────────────────────────────────────────────

  private async enrichListRows(
    contacts: ContactDto[],
  ): Promise<Record<string, unknown>[]> {
    if (contacts.length === 0) return [];
    const ids = contacts.map((c) => c.id);

    // Tags: una sola query y agrupamos por contactId.
    const contactTags = await this.prisma.scoped.contactTag.findMany({
      where: { contactId: { in: ids } },
      include: { tag: { select: { name: true } } },
    });
    const tagsByContact = new Map<string, string[]>();
    for (const ct of contactTags) {
      const arr = tagsByContact.get(ct.contactId) ?? [];
      const name = (ct as { tag?: { name?: string } }).tag?.name;
      if (name) arr.push(name);
      tagsByContact.set(ct.contactId, arr);
    }

    // Counts de identidades email/wapi via groupBy.
    const emailCounts = await this.prisma.scoped.emailContact.groupBy({
      by: ['contactId'],
      where: { contactId: { in: ids } },
      _count: { _all: true },
    });
    const emailByContact = new Map<string, number>();
    for (const row of emailCounts) {
      if (row.contactId) emailByContact.set(row.contactId, row._count._all);
    }

    const wapiCounts = await this.prisma.scoped.wapiContact.groupBy({
      by: ['contactId'],
      where: { contactId: { in: ids } },
      _count: { _all: true },
    });
    const wapiByContact = new Map<string, number>();
    for (const row of wapiCounts) {
      if (row.contactId) wapiByContact.set(row.contactId, row._count._all);
    }

    return contacts.map((c) => ({
      id: c.id,
      externalId: c.externalId ?? '',
      dni: c.dni ?? '',
      cuit: c.cuit ?? '',
      email: c.email ?? '',
      phoneE164: c.phoneE164 ?? '',
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      tagsLabels: (tagsByContact.get(c.id) ?? []).join(', '),
      emailCount: emailByContact.get(c.id) ?? 0,
      wapiCount: wapiByContact.get(c.id) ?? 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  private activityRow(it: TimelineItem): Record<string, unknown> {
    const meta = it.metadata ?? {};
    const subject = typeof meta['subject'] === 'string' ? (meta['subject'] as string) : '';
    const campaignName =
      typeof meta['campaignName'] === 'string' ? (meta['campaignName'] as string) : '';
    const error = typeof meta['error'] === 'string' ? (meta['error'] as string) : '';
    let direction = '';
    if (it.kind === 'wapi.message.in') direction = 'in';
    else if (it.kind === 'wapi.message.out') direction = 'out';

    // Metadata extra (todo lo que no quedó en columnas dedicadas).
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (k === 'subject' || k === 'campaignName' || k === 'error') continue;
      extra[k] = v;
    }

    const at = it.at instanceof Date ? it.at.toISOString() : String(it.at);

    return {
      at,
      channel: it.channel,
      kind: it.kind,
      subject,
      campaignName,
      error,
      direction,
      metadata: Object.keys(extra).length > 0 ? JSON.stringify(extra) : '',
    };
  }

  // ─── aggregators ─────────────────────────────────────────────────────────

  private async aggregateByTag(): Promise<Record<string, unknown>[]> {
    const tags = await this.prisma.scoped.tag.findMany({
      take: MAX_AGGREGATED_GROUPS,
      include: { _count: { select: { contacts: true } } },
      orderBy: { name: 'asc' },
    });
    if (tags.length === 0) return [];

    const tagIds = tags.map((t: { id: string }) => t.id);

    // Para cada tag, contar cuántos de sus contacts tienen identidad email/wapi.
    // Hacemos una sola query con groupBy para evitar N+1.
    const contactTags = await this.prisma.scoped.contactTag.findMany({
      where: { tagId: { in: tagIds } },
      select: { tagId: true, contactId: true },
    });

    // Resolver identities para los contactIds involucrados.
    const contactIds = Array.from(new Set(contactTags.map((ct) => ct.contactId)));
    const contactsWithEmail = new Set<string>();
    const contactsWithWapi = new Set<string>();
    if (contactIds.length > 0) {
      const emailGroups = await this.prisma.scoped.emailContact.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true },
        distinct: ['contactId'],
      });
      for (const row of emailGroups) {
        if (row.contactId) contactsWithEmail.add(row.contactId);
      }
      const wapiGroups = await this.prisma.scoped.wapiContact.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true },
        distinct: ['contactId'],
      });
      for (const row of wapiGroups) {
        if (row.contactId) contactsWithWapi.add(row.contactId);
      }
    }

    // contactIds por tag.
    const byTag = new Map<string, Set<string>>();
    for (const ct of contactTags) {
      const set = byTag.get(ct.tagId) ?? new Set<string>();
      set.add(ct.contactId);
      byTag.set(ct.tagId, set);
    }

    return tags.map((t: { id: string; name: string; _count?: { contacts?: number } }) => {
      const ids = byTag.get(t.id) ?? new Set<string>();
      let emailContactCount = 0;
      let wapiContactCount = 0;
      for (const cid of ids) {
        if (contactsWithEmail.has(cid)) emailContactCount++;
        if (contactsWithWapi.has(cid)) wapiContactCount++;
      }
      return {
        tagId: t.id,
        tagName: t.name,
        contactCount: t._count?.contacts ?? ids.size,
        emailContactCount,
        wapiContactCount,
      };
    });
  }

  private async aggregateByAttribute(
    attributeKey: string,
  ): Promise<Record<string, unknown>[]> {
    // Postgres JSONB no permite groupBy directo en Prisma. Vamos JS post-fetch.
    // Cap en MAX_LIST_ROWS para acotar memoria; si hace falta más, va por Fase 8.
    const contacts = await this.prisma.scoped.contact.findMany({
      take: MAX_LIST_ROWS,
      select: { id: true, attributes: true },
    });

    const counts = new Map<string, number>();
    for (const c of contacts) {
      const attrs = c.attributes;
      if (!attrs || typeof attrs !== 'object') continue;
      const v = (attrs as Record<string, unknown>)[attributeKey];
      if (v === undefined) continue;
      const key = normalizeAttributeValue(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const entries = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_AGGREGATED_GROUPS);

    return entries.map(([value, count]) => ({
      attributeKey,
      attributeValue: value,
      contactCount: count,
    }));
  }

  private async aggregateByExternalIdPrefix(
    prefix: string,
  ): Promise<Record<string, unknown>[]> {
    const contacts = await this.prisma.scoped.contact.findMany({
      where: { externalId: { startsWith: prefix } },
      select: { id: true, externalId: true },
      take: MAX_LIST_ROWS,
    });

    if (contacts.length === 0) {
      return [
        {
          externalIdPrefix: prefix,
          contactCount: 0,
          emailContactCount: 0,
          wapiContactCount: 0,
        },
      ];
    }

    const ids = contacts.map((c) => c.id);
    const emailGroups = await this.prisma.scoped.emailContact.findMany({
      where: { contactId: { in: ids } },
      select: { contactId: true },
      distinct: ['contactId'],
    });
    const wapiGroups = await this.prisma.scoped.wapiContact.findMany({
      where: { contactId: { in: ids } },
      select: { contactId: true },
      distinct: ['contactId'],
    });

    return [
      {
        externalIdPrefix: prefix,
        contactCount: contacts.length,
        emailContactCount: emailGroups.filter((g) => g.contactId).length,
        wapiContactCount: wapiGroups.filter((g) => g.contactId).length,
      },
    ];
  }

  // ─── serialization ───────────────────────────────────────────────────────

  private async serialize(
    format: ContactReportFormat,
    cols: Column[],
    rows: Record<string, unknown>[],
    filename: string,
    sheetName: string,
  ): Promise<GeneratedContactReport> {
    if (format === 'csv') {
      const header = cols.map((c) => c.header);
      const data = rows.map((r) => cols.map((c) => r[c.key] ?? ''));
      const csv = stringify([header, ...data], { quoted_string: true });
      return { filename, mime: MIME_CSV, buffer: Buffer.from(csv, 'utf8') };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    for (const r of rows) ws.addRow(r);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const ab = await wb.xlsx.writeBuffer();
    return { filename, mime: MIME_XLSX, buffer: Buffer.from(ab) };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private summarizeListFilters(
    dto: GenerateContactsListReportDto,
  ): Record<string, unknown> {
    return {
      q: dto.q ?? null,
      tags: dto.tags ?? null,
      channel: dto.channel ?? null,
      hasOpened: dto.hasOpened ?? null,
      hasClicked: dto.hasClicked ?? null,
      hasBounced: dto.hasBounced ?? null,
      sort: dto.sort ?? null,
      direction: dto.direction ?? null,
    };
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}

function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAttributeValue(v: unknown): string {
  if (v === null) return '(null)';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

