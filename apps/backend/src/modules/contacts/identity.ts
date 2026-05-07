export function normalizeDni(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 8) return null;
  return digits;
}

export function isValidDni(raw: string | null | undefined): boolean {
  return normalizeDni(raw) !== null;
}

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeCuit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  const checkDigit = parseInt(digits[10]!, 10);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]!, 10) * CUIT_WEIGHTS[i]!;
  const mod = sum % 11;
  const expected = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  if (expected !== checkDigit) return null;
  return digits;
}

export function isValidCuit(raw: string | null | undefined): boolean {
  return normalizeCuit(raw) !== null;
}

export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (hasPlus && digits[0] === '0') return null;
  return '+' + digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed;
}

export function normalizeExternalId(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}
