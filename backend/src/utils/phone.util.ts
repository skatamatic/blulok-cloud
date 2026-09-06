/**
 * Phone normalization utilities
 *
 * Normalizes phone numbers to E.164 format. Defaults to US (+1) if a region
 * is not provided. This implementation provides a conservative fallback that
 * handles common cases without external dependencies. It should be replaced
 * with libphonenumber-js for full international support when available.
 */

/** Normalize a raw phone string to E.164. Defaults to US region. */
export function toE164(phone: string, defaultRegion: 'US' | string = 'US'): string {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');

  // US default handling
  if (defaultRegion === 'US') {
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
  }

  // Fallback: prefix + if numeric
  return digits ? `+${digits}` : raw;
}

/**
 * Human-readable phone for outbound templates.
 * NANP → `1-780-265-6992`; otherwise E.164 (`+447911123456`).
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const e164 = toE164(raw);
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (e164.startsWith('+')) return e164;
  return digits ? `+${digits}` : '';
}

/** E.164 (`+17802656992`) for template tokens. Blank when missing. */
export function formatPhoneE164(phone: string | null | undefined): string {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  return toE164(raw);
}


