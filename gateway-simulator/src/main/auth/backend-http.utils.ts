/** Pure HTTP helpers for BackendClient (exported for unit tests). */
export function extractErrorMessage(body: Record<string, unknown>, status: number): string {
  if (typeof body.message === 'string') return body.message;
  if (typeof body.error === 'string') return body.error;
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors.map(String).join('; ');
  }
  if (typeof body.raw === 'string' && body.raw.includes('Cannot ')) {
    const match = body.raw.match(/Cannot (GET|POST|PUT|DELETE|PATCH) ([^\s<]+)/);
    if (match) {
      return `API route not found (${match[2]}) — restart the backend if this endpoint was recently added`;
    }
  }
  return `Request failed (${status})`;
}

export async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export function unwrapEnvelope<T>(body: Record<string, unknown>): T {
  return (body.data ?? body) as T;
}
