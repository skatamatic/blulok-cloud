/**
 * The deeplink base is embedded in invite and password-reset messages, so a bad
 * value turns every outbound notification into an attacker-controlled link.
 * Only the app scheme, HTTPS, and loopback HTTP (local development) are allowed.
 */

const ALLOWED_SCHEMES = ['blulok:', 'https:'] as const;
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export const DEEPLINK_BASE_HELP =
  'Deeplink base URL must start with blulok:// or https:// (http:// is allowed for localhost only).';

export function isAllowedDeeplinkBase(value: string): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return true; // empty falls back to the built-in default

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if ((ALLOWED_SCHEMES as readonly string[]).includes(parsed.protocol)) return true;
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.includes(parsed.hostname)) return true;
  return false;
}
