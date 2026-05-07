import {
  isValidCuit,
  isValidDni,
  normalizeCuit,
  normalizeDni,
  normalizeEmail,
  normalizeExternalId,
  normalizePhoneE164,
} from './identity';

describe('identity utils', () => {
  describe('normalizeDni', () => {
    it('acepta 7-8 dígitos limpios', () => {
      expect(normalizeDni('12345678')).toBe('12345678');
      expect(normalizeDni('1234567')).toBe('1234567');
    });

    it('limpia separadores', () => {
      expect(normalizeDni('12.345.678')).toBe('12345678');
      expect(normalizeDni('12 345 678')).toBe('12345678');
    });

    it('rechaza longitud inválida', () => {
      expect(normalizeDni('123456')).toBeNull();
      expect(normalizeDni('123456789')).toBeNull();
    });

    it('null/undefined/empty → null', () => {
      expect(normalizeDni(null)).toBeNull();
      expect(normalizeDni(undefined)).toBeNull();
      expect(normalizeDni('')).toBeNull();
    });

    it('isValidDni espejo', () => {
      expect(isValidDni('12345678')).toBe(true);
      expect(isValidDni('123')).toBe(false);
    });
  });

  describe('normalizeCuit', () => {
    it('acepta CUIT válido con checksum correcto', () => {
      expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
      expect(normalizeCuit('20123456786')).toBe('20123456786');
      expect(normalizeCuit('30-50001091-2')).toBe('30500010912');
    });

    it('rechaza checksum inválido', () => {
      expect(normalizeCuit('20-12345678-9')).toBeNull();
    });

    it('rechaza longitud inválida', () => {
      expect(normalizeCuit('1234567890')).toBeNull();
      expect(normalizeCuit('123456789012')).toBeNull();
    });

    it('null/undefined → null', () => {
      expect(normalizeCuit(null)).toBeNull();
      expect(normalizeCuit(undefined)).toBeNull();
    });

    it('isValidCuit espejo', () => {
      expect(isValidCuit('20-12345678-6')).toBe(true);
      expect(isValidCuit('20-12345678-9')).toBe(false);
    });
  });

  describe('normalizePhoneE164', () => {
    it('agrega + a digits-only ≥8', () => {
      expect(normalizePhoneE164('5491155775452')).toBe('+5491155775452');
      expect(normalizePhoneE164('1155775452')).toBe('+1155775452');
    });

    it('preserva + ya presente', () => {
      expect(normalizePhoneE164('+54 911 5577 5452')).toBe('+5491155775452');
    });

    it('rechaza muy corto', () => {
      expect(normalizePhoneE164('1234567')).toBeNull();
    });

    it('rechaza muy largo (>15 dígitos)', () => {
      expect(normalizePhoneE164('1234567890123456')).toBeNull();
    });

    it('null/empty → null', () => {
      expect(normalizePhoneE164(null)).toBeNull();
      expect(normalizePhoneE164('')).toBeNull();
    });
  });

  describe('normalizeEmail', () => {
    it('lowercase + trim', () => {
      expect(normalizeEmail('  Foo@BAR.com  ')).toBe('foo@bar.com');
    });

    it('null/empty → null', () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail('   ')).toBeNull();
    });
  });

  describe('normalizeExternalId', () => {
    it('trim, conserva case', () => {
      expect(normalizeExternalId('  EMP-001  ')).toBe('EMP-001');
    });

    it('null/empty → null', () => {
      expect(normalizeExternalId(null)).toBeNull();
      expect(normalizeExternalId('')).toBeNull();
      expect(normalizeExternalId('   ')).toBeNull();
    });
  });
});
