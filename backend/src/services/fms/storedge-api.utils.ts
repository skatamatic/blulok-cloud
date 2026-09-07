/**
 * Storable Edge collection endpoints return `{ units: [...] }`.
 * Single-resource GETs often wrap the same way: `{ unit: { id, ... } }`.
 */

export function unwrapStoredgeEntity(
  payload: unknown,
  keys: string[]
): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>;
      if (inner.id != null) {
        return inner;
      }
    }
  }

  if (record.id != null) {
    return record;
  }

  return null;
}
