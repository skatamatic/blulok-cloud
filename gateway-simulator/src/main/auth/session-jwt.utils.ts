/** Parse JWT exp claim (unix seconds). */
export function parseJwtExpiry(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/** True when token exists and is not within bufferSec of expiry. */
export function isJwtFresh(token: string | undefined, bufferSec = 60): boolean {
  if (!token) return false;
  const exp = parseJwtExpiry(token);
  if (!exp) return false;
  return exp > Math.floor(Date.now() / 1000) + bufferSec;
}
