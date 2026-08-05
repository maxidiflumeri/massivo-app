export function formatPhone(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.startsWith('+') ? phone.slice(1) : phone;
  if (/^54/.test(trimmed) && trimmed.length >= 11) {
    const country = trimmed.slice(0, 2);
    const area = trimmed.slice(2, 5);
    const rest = trimmed.slice(5);
    return `+${country} ${area} ${rest}`;
  }
  return phone.startsWith('+') ? phone : `+${trimmed}`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const now = Date.now();
  const diffMs = now - ts;
  if (diffMs < 60_000) return 'ahora';
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMs / 3_600_000);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  const isThisYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function isWindowOpen(freeformWindowAt: string | null): boolean {
  if (!freeformWindowAt) return false;
  return new Date(freeformWindowAt).getTime() > Date.now();
}

export function initials(name: string | null, phone: string): string {
  const src = name?.trim() || phone;
  if (!src) return '??';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (parts[0] ?? '').slice(0, 2).toUpperCase();
}

/**
 * Blindaje de render para el preview de la última conversación. El backend lo
 * arma como texto plano, pero un shape inesperado (p.ej. el `body: { text }` de
 * los interactivos, que devolvía el objeto crudo) llegaba al JSX y tiraba abajo
 * toda la pantalla con "Objects are not valid as a React child". Acá degradamos
 * a string en vez de romper.
 *
 * El origen está arreglado en `extractPreview` del backend; esto queda como red
 * de seguridad para cualquier forma nueva de mensaje.
 */
export function coerceSubtitle(preview: unknown): string {
  if (typeof preview === 'string') return preview;
  if (preview == null) return '';
  if (typeof preview === 'object') {
    // eslint-disable-next-line no-console
    console.warn('[inbox] preview con shape inesperado, descartando:', preview);
    const body = (preview as { body?: unknown; text?: unknown }).body;
    if (typeof body === 'string') return body;
    const text = (preview as { text?: unknown }).text;
    if (typeof text === 'string') return text;
    if (text && typeof text === 'object') {
      const inner = (text as { body?: unknown }).body;
      if (typeof inner === 'string') return inner;
    }
    return '';
  }
  return String(preview);
}
