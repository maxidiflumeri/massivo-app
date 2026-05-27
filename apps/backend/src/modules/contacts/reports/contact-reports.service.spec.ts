/**
 * 5.E — Tests del ContactReportsService.
 *
 * Cubren los 3 reportes (list, activity, aggregated) × 2 formatos (csv, xlsx)
 * con mocks de prisma.scoped + ContactsService + ContactTimelineService +
 * AuditLogService. Asserts:
 *   - shape del CSV / XLSX (header + filas, valores críticos).
 *   - errores: contacto inexistente, attributeKey/externalIdPrefix faltante.
 *   - audit log se llama con metadata correcta.
 */
import ExcelJS from 'exceljs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactReportsService, MAX_LIST_ROWS } from './contact-reports.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

const tenantA: RequestContext = {
  userId: 'user-1',
  organizationId: 'org-a',
  teamId: 'team-a1',
  orgRole: 'OWNER',
  teamRole: 'ADMIN',
};

function makeContact(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    organizationId: 'org-a',
    teamId: null,
    externalId: null,
    dni: null,
    cuit: null,
    email: null,
    phone: null,
    phoneE164: null,
    firstName: null,
    lastName: null,
    attributes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('ContactReportsService', () => {
  let prisma: {
    scoped: {
      contact: { findFirst: jest.Mock; findMany: jest.Mock };
      contactTag: { findMany: jest.Mock };
      emailContact: { groupBy: jest.Mock; findMany: jest.Mock };
      wapiContact: { groupBy: jest.Mock; findMany: jest.Mock };
      tag: { findMany: jest.Mock };
    };
  };
  let contacts: { search: jest.Mock };
  let timeline: { getTimeline: jest.Mock };
  let audit: { log: jest.Mock };
  let svc: ContactReportsService;

  beforeEach(() => {
    prisma = {
      scoped: {
        contact: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        contactTag: { findMany: jest.fn().mockResolvedValue([]) },
        emailContact: {
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([]),
        },
        wapiContact: {
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([]),
        },
        tag: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    contacts = { search: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    timeline = { getTimeline: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    svc = new ContactReportsService(
      prisma as never,
      contacts as never,
      timeline as never,
      audit as never,
    );
  });

  // ─── generateList ───────────────────────────────────────────────────────

  describe('generateList', () => {
    it('CSV con header + 1 fila + tags + counts', async () => {
      contacts.search.mockResolvedValueOnce({
        items: [
          makeContact('c1', {
            externalId: 'EMP-1',
            email: 'a@x.com',
            firstName: 'Ana',
          }),
        ],
        nextCursor: null,
      });
      prisma.scoped.contactTag.findMany.mockResolvedValueOnce([
        { contactId: 'c1', tag: { name: 'vip' } },
        { contactId: 'c1', tag: { name: 'mora' } },
      ]);
      prisma.scoped.emailContact.groupBy.mockResolvedValueOnce([
        { contactId: 'c1', _count: { _all: 3 } },
      ]);
      prisma.scoped.wapiContact.groupBy.mockResolvedValueOnce([
        { contactId: 'c1', _count: { _all: 1 } },
      ]);

      const r = await TenantContext.run(tenantA, () =>
        svc.generateList({ format: 'csv' } as never),
      );

      expect(r.filename).toMatch(/^contacts-list-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(r.mime).toMatch(/^text\/csv/);
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(2); // header + 1
      expect(lines[0]).toContain('External ID');
      expect(lines[0]).toContain('Tags');
      expect(lines[1]).toContain('"EMP-1"');
      expect(lines[1]).toContain('"a@x.com"');
      expect(lines[1]).toContain('"vip, mora"');
      expect(lines[1]).toContain('3'); // emailCount
    });

    it('XLSX: parseable, header bold, frozen first row', async () => {
      contacts.search.mockResolvedValueOnce({
        items: [makeContact('c1', { externalId: 'EMP-1' })],
        nextCursor: null,
      });
      const r = await TenantContext.run(tenantA, () =>
        svc.generateList({ format: 'xlsx' } as never),
      );
      expect(r.mime).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(r.filename.endsWith('.xlsx')).toBe(true);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.buffer as never);
      const ws = wb.getWorksheet('Contactos');
      expect(ws).toBeDefined();
      expect(ws!.getRow(1).font?.bold).toBe(true);
      expect(ws!.views?.[0]?.state).toBe('frozen');
    });

    it('loop con cursor: pagina hasta que nextCursor=null', async () => {
      contacts.search
        .mockResolvedValueOnce({ items: [makeContact('c1')], nextCursor: 'c1' })
        .mockResolvedValueOnce({ items: [makeContact('c2')], nextCursor: 'c2' })
        .mockResolvedValueOnce({ items: [makeContact('c3')], nextCursor: null });

      await TenantContext.run(tenantA, () =>
        svc.generateList({ format: 'csv' } as never),
      );
      expect(contacts.search).toHaveBeenCalledTimes(3);
      expect(contacts.search.mock.calls[1]![0].cursor).toBe('c1');
      expect(contacts.search.mock.calls[2]![0].cursor).toBe('c2');
    });

    it('cap MAX_LIST_ROWS: deja de paginar cuando se alcanza', async () => {
      const big = Array.from({ length: 200 }, (_, i) => makeContact(`c${i}`));
      // Devuelve siempre 200 con un nextCursor para forzar paginación infinita.
      contacts.search.mockImplementation((args: { cursor?: string }) =>
        Promise.resolve({
          items: big,
          nextCursor: `next-${args.cursor ?? '0'}`,
        }),
      );

      await TenantContext.run(tenantA, () =>
        svc.generateList({ format: 'csv' } as never),
      );
      // 50_000 / 200 = 250 páginas.
      expect(contacts.search).toHaveBeenCalledTimes(MAX_LIST_ROWS / 200);
    });

    it('contactos sin tags / identities → emailCount=0, wapiCount=0, tagsLabels vacío', async () => {
      contacts.search.mockResolvedValueOnce({
        items: [makeContact('c1', { email: 'lone@x.com' })],
        nextCursor: null,
      });
      const r = await TenantContext.run(tenantA, () =>
        svc.generateList({ format: 'csv' } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      // tagsLabels vacío + emailCount=0 + wapiCount=0
      expect(lines[1]).toContain('""'); // empty tags
      expect(lines[1]).toMatch(/,0,0,/); // emailCount=0,wapiCount=0
    });

    it('audit log se llama con metadata correcta', async () => {
      contacts.search.mockResolvedValueOnce({
        items: [makeContact('c1')],
        nextCursor: null,
      });
      await TenantContext.run(tenantA, () =>
        svc.generateList({
          format: 'csv',
          q: 'maxi',
          channel: 'email',
          hasOpened: true,
        } as never),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contacts.report.generated',
          resourceType: 'Contact',
          metadata: expect.objectContaining({
            kind: 'list',
            format: 'csv',
            rowCount: 1,
            filterSummary: expect.objectContaining({
              q: 'maxi',
              channel: 'email',
              hasOpened: true,
            }),
          }),
        }),
      );
    });
  });

  // ─── generateActivity ───────────────────────────────────────────────────

  describe('generateActivity', () => {
    it('contacto inexistente → NotFound', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce(null);
      await expect(
        TenantContext.run(tenantA, () =>
          svc.generateActivity('missing', { format: 'csv' } as never),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sin actividad → CSV con sólo header', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce({ id: 'c1' });
      timeline.getTimeline.mockResolvedValueOnce({ items: [], nextCursor: null });
      const r = await TenantContext.run(tenantA, () =>
        svc.generateActivity('c1', { format: 'csv' } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Canal');
    });

    it('filtra por dateFrom/dateTo en memoria', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce({ id: 'c1' });
      timeline.getTimeline.mockResolvedValueOnce({
        items: [
          {
            id: 't1',
            at: new Date('2026-05-01T00:00:00Z'),
            channel: 'email',
            kind: 'email.sent',
            refId: 'r1',
            metadata: { subject: 'old', campaignName: 'C1' },
          },
          {
            id: 't2',
            at: new Date('2026-05-15T00:00:00Z'),
            channel: 'email',
            kind: 'email.sent',
            refId: 'r2',
            metadata: { subject: 'mid', campaignName: 'C1' },
          },
          {
            id: 't3',
            at: new Date('2026-05-30T00:00:00Z'),
            channel: 'email',
            kind: 'email.opened',
            refId: 'r3',
            metadata: {},
          },
        ],
        nextCursor: null,
      });
      const r = await TenantContext.run(tenantA, () =>
        svc.generateActivity('c1', {
          format: 'csv',
          dateFrom: new Date('2026-05-10T00:00:00Z'),
          dateTo: new Date('2026-05-20T00:00:00Z'),
        } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      // Solo "mid" entra en el rango.
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('"mid"');
    });

    it('forwards channel filter al timeline service', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce({ id: 'c1' });
      await TenantContext.run(tenantA, () =>
        svc.generateActivity('c1', { format: 'csv', channel: 'wapi' } as never),
      );
      expect(timeline.getTimeline.mock.calls[0]![1].channel).toBe('wapi');
    });

    it('mapea direction=in|out para wapi.message.*', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce({ id: 'c1' });
      timeline.getTimeline.mockResolvedValueOnce({
        items: [
          {
            id: 'm1',
            at: new Date('2026-05-01T00:00:00Z'),
            channel: 'wapi',
            kind: 'wapi.message.in',
            refId: 'r1',
            metadata: { type: 'text' },
          },
          {
            id: 'm2',
            at: new Date('2026-05-02T00:00:00Z'),
            channel: 'wapi',
            kind: 'wapi.message.out',
            refId: 'r2',
            metadata: { type: 'text' },
          },
        ],
        nextCursor: null,
      });
      const r = await TenantContext.run(tenantA, () =>
        svc.generateActivity('c1', { format: 'csv' } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines[1]).toContain('"in"');
      expect(lines[2]).toContain('"out"');
    });

    it('audit log con resourceId=contactId', async () => {
      prisma.scoped.contact.findFirst.mockResolvedValueOnce({ id: 'c1' });
      await TenantContext.run(tenantA, () =>
        svc.generateActivity('c1', { format: 'xlsx' } as never),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contacts.report.generated',
          resourceType: 'Contact',
          resourceId: 'c1',
          metadata: expect.objectContaining({
            kind: 'activity',
            format: 'xlsx',
          }),
        }),
      );
    });
  });

  // ─── generateAggregated ─────────────────────────────────────────────────

  describe('generateAggregated', () => {
    it('groupBy=tag: agrupa con counts email/wapi por tag', async () => {
      prisma.scoped.tag.findMany.mockResolvedValueOnce([
        { id: 'tag-1', name: 'VIP', _count: { contacts: 2 } },
        { id: 'tag-2', name: 'Mora', _count: { contacts: 1 } },
      ]);
      prisma.scoped.contactTag.findMany.mockResolvedValueOnce([
        { tagId: 'tag-1', contactId: 'c1' },
        { tagId: 'tag-1', contactId: 'c2' },
        { tagId: 'tag-2', contactId: 'c2' },
      ]);
      prisma.scoped.emailContact.findMany.mockResolvedValueOnce([
        { contactId: 'c1' },
        { contactId: 'c2' },
      ]);
      prisma.scoped.wapiContact.findMany.mockResolvedValueOnce([{ contactId: 'c2' }]);

      const r = await TenantContext.run(tenantA, () =>
        svc.generateAggregated({ format: 'csv', groupBy: 'tag' } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(3); // header + 2 tags
      expect(lines[0]).toContain('Tag ID');
      expect(lines[1]).toContain('"VIP"');
      expect(lines[1]).toContain('2'); // contactCount
      // Tag VIP tiene c1 (email) + c2 (email+wapi) → emailContactCount=2, wapiContactCount=1
      expect(lines[1]).toMatch(/"VIP",2,2,1/);
    });

    it('groupBy=attribute sin attributeKey → BadRequest', async () => {
      await expect(
        TenantContext.run(tenantA, () =>
          svc.generateAggregated({ format: 'csv', groupBy: 'attribute' } as never),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('groupBy=attribute agrupa por valor del attribute', async () => {
      prisma.scoped.contact.findMany.mockResolvedValueOnce([
        { id: 'c1', attributes: { segment: 'A' } },
        { id: 'c2', attributes: { segment: 'B' } },
        { id: 'c3', attributes: { segment: 'A' } },
        { id: 'c4', attributes: { otherKey: 'X' } },
        { id: 'c5', attributes: null },
      ]);
      const r = await TenantContext.run(tenantA, () =>
        svc.generateAggregated({
          format: 'csv',
          groupBy: 'attribute',
          attributeKey: 'segment',
        } as never),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(3); // header + A + B
      expect(lines[1]).toContain('"A"');
      expect(lines[1]).toContain('2');
      expect(lines[2]).toContain('"B"');
      expect(lines[2]).toContain('1');
    });

    it('groupBy=externalIdPattern sin prefix → BadRequest', async () => {
      await expect(
        TenantContext.run(tenantA, () =>
          svc.generateAggregated({
            format: 'csv',
            groupBy: 'externalIdPattern',
          } as never),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('groupBy=externalIdPattern: filtra por startsWith y reporta counts', async () => {
      prisma.scoped.contact.findMany.mockResolvedValueOnce([
        { id: 'c1', externalId: 'EMP-001' },
        { id: 'c2', externalId: 'EMP-002' },
      ]);
      prisma.scoped.emailContact.findMany.mockResolvedValueOnce([{ contactId: 'c1' }]);
      prisma.scoped.wapiContact.findMany.mockResolvedValueOnce([
        { contactId: 'c1' },
        { contactId: 'c2' },
      ]);

      const r = await TenantContext.run(tenantA, () =>
        svc.generateAggregated({
          format: 'csv',
          groupBy: 'externalIdPattern',
          externalIdPrefix: 'EMP-',
        } as never),
      );

      // Verifica que el where pasó startsWith.
      const findManyCall = prisma.scoped.contact.findMany.mock.calls[0]![0];
      expect(findManyCall.where.externalId.startsWith).toBe('EMP-');

      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(2); // header + 1
      expect(lines[1]).toContain('"EMP-"');
      expect(lines[1]).toContain('2'); // contactCount
    });

    it('audit log con groupBy en filterSummary', async () => {
      await TenantContext.run(tenantA, () =>
        svc.generateAggregated({ format: 'xlsx', groupBy: 'tag' } as never),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contacts.report.generated',
          metadata: expect.objectContaining({
            kind: 'aggregated',
            format: 'xlsx',
            filterSummary: expect.objectContaining({ groupBy: 'tag' }),
          }),
        }),
      );
    });
  });
});
