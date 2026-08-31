/**
 * Generate a RFC 4122 v4 UUID in the browser.
 *
 * `crypto.randomUUID()` is only available in secure contexts (HTTPS or localhost).
 * Dev servers accessed over LAN HTTP (e.g. http://192.168.x.x:3001) are not secure,
 * so we fall back to `crypto.getRandomValues()` which works in those contexts.
 */
export function generateUuid(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Crypto API unavailable — cannot generate UUID');
  }

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
