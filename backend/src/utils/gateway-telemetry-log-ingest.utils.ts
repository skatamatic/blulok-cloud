/**
 * Normalize add_log request bodies from gateway PROXY (JSON object, JSON string document, or raw line).
 */
export function normalizeAddLogBody(raw: unknown): Record<string, unknown> | null {
  let body: unknown = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { message: body };
    }
  }
  if (typeof body === 'string') {
    return { message: body };
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return null;
}

/** Wrap raw PROXY string bodies so Express JSON parsing receives an object. */
export function wrapProxyStringBodyForAddLog(path: string, body: unknown): unknown {
  if (typeof body !== 'string') return body;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedPath.includes('internal/gateway/add_log')) return body;
  return { message: body };
}
