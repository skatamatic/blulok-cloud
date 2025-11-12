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


