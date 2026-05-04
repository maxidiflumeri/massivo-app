/**
 * Tests del ReportGeneratorService. Cubren los 4 generators × 2 formatos
 * con mocks de prisma.scoped. Asserts:
 *   - shape del CSV (header + data rows, valores de columnas críticas).
 *   - shape del XLSX (parseado de vuelta vía ExcelJS — header bold, valores).
 *   - errores: campaign-summary sin campaignId, campaña inexistente.
 */
import ExcelJS from 'exceljs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportGeneratorService } from './report-generator.service';

describe('ReportGeneratorService', () => {
  let prisma: {
    scoped: {
      emailCampaign: { findFirst: jest.Mock };
      emailReport: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
      emailBounce: { findMany: jest.Mock };
      emailUnsubscribe: { findMany: jest.Mock };
    };
  };
  let svc: ReportGeneratorService;

  beforeEach(() => {
    prisma = {
      scoped: {
        emailCampaign: { findFirst: jest.fn() },
        emailReport: {
          groupBy: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
        emailBounce: { findMany: jest.fn().mockResolvedValue([]) },
        emailUnsubscribe: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    svc = new ReportGeneratorService(prisma as never);
  });

  describe('campaign-summary', () => {
    it('devuelve CSV con header + 1 fila + counts agregados', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({
        id: 'c1',
        name: 'Campaña 1',
        status: 'COMPLETED',
        createdAt: new Date('2026-04-01T00:00:00Z'),
      });
      prisma.scoped.emailReport.groupBy.mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 80 } },
        { status: 'FAILED', _count: { _all: 2 } },
        { status: 'BOUNCED', _count: { _all: 3 } },
      ]);
      prisma.scoped.emailReport.count
        .mockResolvedValueOnce(40) // uniqueOpens
        .mockResolvedValueOnce(15); // uniqueClicks

      const r = await svc.generate('campaign-summary', 'csv', { campaignId: 'c1' });

      expect(r.filename).toBe('campaign-c1-summary.csv');
      expect(r.mime).toMatch(/^text\/csv/);
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('Campaign ID');
      expect(lines[0]).toContain('Open rate');
      expect(lines[1]).toContain('"c1"');
      expect(lines[1]).toContain('"Campaña 1"');
      expect(lines[1]).toContain('80'); // sent
      expect(lines[1]).toContain('0.5'); // openRate 40/80
    });

    it('xlsx: parseable, header bold, valor de openRate correcto', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({
        id: 'c1', name: 'C1', status: 'COMPLETED', createdAt: new Date(),
      });
      prisma.scoped.emailReport.groupBy.mockResolvedValueOnce([
        { status: 'SENT', _count: { _all: 50 } },
      ]);
      prisma.scoped.emailReport.count
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(10);

      const r = await svc.generate('campaign-summary', 'xlsx', { campaignId: 'c1' });
      expect(r.mime).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(r.filename.endsWith('.xlsx')).toBe(true);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(r.buffer as never);
      const ws = wb.getWorksheet('Reporte');
      expect(ws).toBeDefined();
      const headerRow = ws!.getRow(1);
      expect(headerRow.getCell(1).value).toBe('Campaign ID');
      expect(headerRow.font?.bold).toBe(true);
      const dataRow = ws!.getRow(2);
      expect(dataRow.getCell(1).value).toBe('c1');
      // openRate 25/50 = 0.5
      const openRateCol = headerRow.values as unknown[];
      const idx = openRateCol.indexOf('Open rate');
      expect(dataRow.getCell(idx).value).toBe(0.5);
    });

    it('sin campaignId → BadRequest', async () => {
      await expect(svc.generate('campaign-summary', 'csv', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('campaña no encontrada → NotFound', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce(null);
      await expect(
        svc.generate('campaign-summary', 'csv', { campaignId: 'cx' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('campaign-reports', () => {
    it('lista por contacto, respeta filtro por status', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', name: 'C1' });
      prisma.scoped.emailReport.findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          status: 'SENT',
          sentAt: new Date('2026-04-15T10:00:00Z'),
          firstOpenedAt: new Date('2026-04-15T10:30:00Z'),
          firstClickedAt: null,
          smtpMessageId: 'msg-1',
          error: null,
          contact: { email: 'a@example.com', name: 'Ana' },
          _count: { events: 3 },
        },
        {
          id: 'r2',
          status: 'SENT',
          sentAt: new Date('2026-04-15T10:01:00Z'),
          firstOpenedAt: null,
          firstClickedAt: null,
          smtpMessageId: 'msg-2',
          error: null,
          contact: { email: 'b@example.com', name: null },
          _count: { events: 0 },
        },
      ]);

      const r = await svc.generate('campaign-reports', 'csv', {
        campaignId: 'c1',
        status: 'SENT',
      });
      expect(prisma.scoped.emailReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { campaignId: 'c1', status: 'SENT' } }),
      );
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(3); // header + 2
      expect(lines[1]).toContain('"a@example.com"');
      expect(lines[1]).toContain('"Ana"');
      expect(lines[2]).toContain('"b@example.com"');
    });

    it('sin status → no aplica filtro', async () => {
      prisma.scoped.emailCampaign.findFirst.mockResolvedValueOnce({ id: 'c1', name: 'C1' });
      prisma.scoped.emailReport.findMany.mockResolvedValueOnce([]);
      await svc.generate('campaign-reports', 'csv', { campaignId: 'c1' });
      expect(prisma.scoped.emailReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { campaignId: 'c1' } }),
      );
    });
  });

  describe('bounces-complaints', () => {
    it('combina bounces + complaints, ordena desc, default 30 días', async () => {
      prisma.scoped.emailBounce.findMany.mockResolvedValueOnce([
        {
          id: 'b1',
          email: 'bounce@x.com',
          code: '550',
          description: 'mailbox full',
          occurredAt: new Date('2026-04-15T00:00:00Z'),
          smtpMessageId: 'msg-b1',
          report: { campaignId: 'c1' },
        },
      ]);
      prisma.scoped.emailReport.findMany.mockResolvedValueOnce([
        {
          id: 'r9',
          updatedAt: new Date('2026-04-20T00:00:00Z'),
          smtpMessageId: 'msg-r9',
          campaignId: 'c2',
          contact: { email: 'spam@x.com' },
        },
      ]);

      const r = await svc.generate('bounces-complaints', 'csv', {});
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(3);
      // Más reciente primero (complaint del 20)
      expect(lines[1]).toContain('"COMPLAINT"');
      expect(lines[1]).toContain('"spam@x.com"');
      expect(lines[2]).toContain('"BOUNCE"');
      expect(lines[2]).toContain('"550"');

      const where = prisma.scoped.emailBounce.findMany.mock.calls[0]![0].where;
      expect(where.occurredAt.gte).toBeInstanceOf(Date);
      expect(where.occurredAt.lte).toBeInstanceOf(Date);
      const span = where.occurredAt.lte.getTime() - where.occurredAt.gte.getTime();
      expect(span).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('respeta fromDate/toDate explícitos', async () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const to = new Date('2026-01-31T00:00:00Z');
      await svc.generate('bounces-complaints', 'csv', { fromDate: from, toDate: to });
      const where = prisma.scoped.emailBounce.findMany.mock.calls[0]![0].where;
      expect(where.occurredAt.gte).toEqual(from);
      expect(where.occurredAt.lte).toEqual(to);
    });
  });

  describe('suppressions', () => {
    it('exporta unsubscribes con scope/source', async () => {
      prisma.scoped.emailUnsubscribe.findMany.mockResolvedValueOnce([
        {
          id: 'u1',
          email: 'opt-out@x.com',
          scope: 'GLOBAL',
          campaignId: null,
          reason: 'no quiero más',
          source: 'manual',
          createdAt: new Date('2026-03-01T00:00:00Z'),
        },
      ]);
      const r = await svc.generate('suppressions', 'csv', {});
      expect(r.filename).toBe('suppressions-snapshot.csv');
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('"opt-out@x.com"');
      expect(lines[1]).toContain('"GLOBAL"');
      expect(lines[1]).toContain('"manual"');
    });

    it('lista vacía → CSV con sólo header', async () => {
      const r = await svc.generate('suppressions', 'csv', {});
      const lines = r.buffer.toString('utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('Email');
    });
  });
});
