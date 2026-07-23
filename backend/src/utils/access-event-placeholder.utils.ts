/**
 * Gateway firmware often fills actor/unit fields with placeholders when it only
 * knows IDs. Cloud should ignore these and resolve from user_id / device_id.
 */

const PLACEHOLDER_EXACT = new Set([
  'unknown',
  'none',
  'null',
  'undefined',
  'n/a',
  'na',
  'unknown user',
  'unknown-user',
  'unknown unit',
  'unknown-unit',
  'unknown-unit-id',
  'unknown-app-device',
  'unknown app device',
]);

const PLACEHOLDER_PREFIXES = ['unknown-', 'unknown '];

export function isPlaceholderAccessString(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_EXACT.has(lower)) return true;
  return PLACEHOLDER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/** Prefer real display names; treat gateway placeholders / bare "user" as missing. */
export function isUsableAccessDisplayName(value: string | undefined | null): boolean {
  if (isPlaceholderAccessString(value)) return false;
  const trimmed = String(value).trim();
  if (/^user$/i.test(trimmed)) return false;
  return true;
}

export function coerceOptionalAccessId(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholderAccessString(trimmed)) return undefined;
  return trimmed;
}

export function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = metadata[key];
  return typeof raw === 'string' ? raw : undefined;
}

export function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = metadata[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
