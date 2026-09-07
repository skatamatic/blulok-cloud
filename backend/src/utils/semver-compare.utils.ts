/**
 * Lightweight semver comparison for firmware version selection.
 * Supports optional leading "v" and ignores pre-release/build metadata beyond major.minor.patch.
 */

function parseVersion(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns negative if a < b, positive if a > b, 0 if equal or unparseable tie. */
export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Pick the highest semver from a list; falls back to first item if none parse. */
export function pickHighestSemver<T extends { version: string }>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) => {
    if (compareSemver(item.version, best.version) > 0) return item;
    return best;
  });
}
