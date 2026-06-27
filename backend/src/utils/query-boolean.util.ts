/** Parse query/body booleans after Joi validation (boolean) or from raw Express query strings. */
export function parseQueryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return undefined;
}

/** Parse numeric query params after Joi coercion (number) or from raw query strings. */
export function parseQueryInt(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/** Like parseQueryInt but returns undefined when the param is absent. */
export function parseOptionalQueryInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Normalize OpenAPI-validated query strings (still strings after Joi). */
export function queryString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** Normalize date query params after Joi.date() coercion or raw ISO strings. */
export function queryDateString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

/** Normalize a single value or array of query strings (e.g. facility_ids). */
export function queryStringArray(value: unknown): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => queryString(item)).filter((item): item is string => !!item);
  }
  const single = queryString(value);
  return single ? [single] : [];
}

/** Clamp a parsed integer to [min, max]. Uses defaultValue when input is absent or invalid. */
export function parseQueryIntClamped(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed, min), max);
}
