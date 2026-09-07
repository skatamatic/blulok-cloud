/**
 * Extract a user-visible message from axios/API errors and generic Error throws.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const msg = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

/** Machine-readable API error code from axios response body (`code` field). */
export function getApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const code = (error as { response?: { data?: { code?: unknown } } }).response?.data?.code;
  return typeof code === 'string' && code.trim() ? code : undefined;
}
