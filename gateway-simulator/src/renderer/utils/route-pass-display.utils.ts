const TIME_CLAIMS = new Set(['iat', 'exp', 'nbf']);

function formatUnixTimestamp(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function summarizeAudience(audiences: string[]): Record<string, string[] | number> {
  const locks: string[] = [];
  const accessControls: string[] = [];
  const sharedKeys: string[] = [];
  const other: string[] = [];

  for (const entry of audiences) {
    if (entry.startsWith('lock:')) locks.push(entry.slice('lock:'.length));
    else if (entry.startsWith('access_control:')) accessControls.push(entry.slice('access_control:'.length));
    else if (entry.startsWith('shared_key:')) sharedKeys.push(entry);
    else other.push(entry);
  }

  const summary: Record<string, string[] | number> = { total: audiences.length };
  if (locks.length) summary.locks = locks;
  if (accessControls.length) summary.access_controls = accessControls;
  if (sharedKeys.length) summary.shared_keys = sharedKeys;
  if (other.length) summary.other = other;
  return summary;
}

/** Enrich JWT claims with human-readable timestamps and audience grouping for display. */
export function enrichRoutePassClaimsForDisplay(
  claims: Record<string, unknown>,
): Record<string, unknown> {
  const display: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(claims)) {
    if (TIME_CLAIMS.has(key) && typeof value === 'number') {
      display[key] = {
        unix: value,
        local: formatUnixTimestamp(value),
        iso: new Date(value * 1000).toISOString(),
      };
      continue;
    }

    if (key === 'aud') {
      const audiences = Array.isArray(value) ? value.map(String) : [String(value)];
      display.aud = audiences;
      display.audience_summary = summarizeAudience(audiences);
      continue;
    }

    display[key] = value;
  }

  return display;
}

export function formatRoutePassJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatRoutePassPayloadForDisplay(payload: Record<string, unknown>): string {
  return formatRoutePassJson(enrichRoutePassClaimsForDisplay(payload));
}

export function formatRoutePassHeaderForDisplay(header: Record<string, unknown>): string {
  return formatRoutePassJson(header);
}

export function routePassTamperLabel(tamper: import('@protocol/user-simulator-state').RoutePassTamperMode): string {
  switch (tamper) {
    case 'force_expired':
      return 'Expired (simulated)';
    case 'corrupt_signature':
      return 'Bad signature (simulated)';
    default:
      return 'Valid (as fetched)';
  }
}

export function routePassTamperHelpText(
  tamper: import('@protocol/user-simulator-state').RoutePassTamperMode,
): string {
  switch (tamper) {
    case 'force_expired':
      return 'When you try open at a lock, the simulator presents a JWT with an expired exp claim. The cached pass from the cloud is unchanged; denial happens before signature verification.';
    case 'corrupt_signature':
      return 'When you try open at a lock, the simulator corrupts the JWT signature bytes on presentation. The cached pass is unchanged; the lock should deny with invalid signature.';
    default:
      return 'Present the cached route pass exactly as issued by the cloud — signature and expiry are verified normally.';
  }
}
