import { BadRequestException } from '@nestjs/common';
import { addDays, eachDay, parseRange, zonedDayKey, zonedDayStart } from './monitoring-range';

describe('monitoring-range', () => {
  describe('zonedDayStart', () => {
    it('ancla el día local a su instante UTC (ART = UTC−3)', () => {
      expect(zonedDayStart('2026-08-05').toISOString()).toBe('2026-08-05T03:00:00.000Z');
      expect(zonedDayStart('2026-01-01').toISOString()).toBe('2026-01-01T03:00:00.000Z');
    });

    it('resuelve el borde de horario de verano en zonas que sí lo tienen', () => {
      // Nueva York cambia de hora el 8 de marzo de 2026: el día anterior arranca
      // 05:00Z y el siguiente 04:00Z. La segunda pasada del cálculo es la que
      // hace falta para no errarle por una hora.
      expect(zonedDayStart('2026-03-08', 'America/New_York').toISOString()).toBe(
        '2026-03-08T05:00:00.000Z',
      );
      expect(zonedDayStart('2026-03-09', 'America/New_York').toISOString()).toBe(
        '2026-03-09T04:00:00.000Z',
      );
    });
  });

  it('zonedDayKey devuelve el día local, no el UTC', () => {
    // 2026-08-06T01:30Z son todavía las 22:30 del 5 en Buenos Aires.
    expect(zonedDayKey(new Date('2026-08-06T01:30:00Z'))).toBe('2026-08-05');
  });

  it('addDays cruza fin de mes y de año', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  describe('parseRange', () => {
    it('toma from/to inclusive y deja `to` exclusivo en el día siguiente', () => {
      const r = parseRange({ from: '2026-08-05', to: '2026-08-27' });
      expect(r.days).toBe(23);
      expect(r.from.toISOString()).toBe('2026-08-05T03:00:00.000Z');
      expect(r.to.toISOString()).toBe('2026-08-28T03:00:00.000Z');
    });

    it('un solo día cubre sus 24 horas', () => {
      const r = parseRange({ from: '2026-08-05', to: '2026-08-05' });
      expect(r.days).toBe(1);
      expect(r.to.getTime() - r.from.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('`days` cuenta hoy incluido', () => {
      const r = parseRange({ days: '7' });
      expect(r.days).toBe(7);
      expect(r.toDay).toBe(zonedDayKey(new Date()));
    });

    it('sin parámetros cae en los últimos 7 días', () => {
      expect(parseRange({}).days).toBe(7);
    });

    it('rechaza from sin to', () => {
      expect(() => parseRange({ from: '2026-08-05' })).toThrow(BadRequestException);
    });

    it('rechaza formatos que no son YYYY-MM-DD', () => {
      expect(() => parseRange({ from: '05/08/2026', to: '2026-08-27' })).toThrow(BadRequestException);
    });

    it('rechaza el rango invertido', () => {
      expect(() => parseRange({ from: '2026-08-27', to: '2026-08-05' })).toThrow(BadRequestException);
    });

    it('rechaza rangos más largos que el tope', () => {
      expect(() => parseRange({ from: '2024-01-01', to: '2026-01-01' })).toThrow(BadRequestException);
      expect(() => parseRange({ days: '999' })).toThrow(BadRequestException);
    });

    it('rechaza `days` no entero', () => {
      expect(() => parseRange({ days: '7.5' })).toThrow(BadRequestException);
      expect(() => parseRange({ days: 'siete' })).toThrow(BadRequestException);
    });
  });

  it('eachDay devuelve la serie continua, extremos incluidos', () => {
    const dias = eachDay(parseRange({ from: '2026-08-30', to: '2026-09-02' }));
    expect(dias).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  });
});
