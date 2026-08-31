/** Request headers permitted on cross-origin API calls (must match browser preflight). */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-App-Device-Id',
  'X-App-Platform',
  'X-Requested-With',
  'Cache-Control',
] as const;

export const CORS_ALLOWED_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
] as const;
