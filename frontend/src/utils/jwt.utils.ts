/** Decode JWT expiration (ms since epoch) without verifying signature. */
export function getJwtExpirationMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, skewMs = 30_000): boolean {
  const exp = getJwtExpirationMs(token);
  if (exp == null) return false;
  return exp <= Date.now() + skewMs;
}
