/** Default gateway WS max message — aligned with backend. */
export const GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT = 5 * 1024 * 1024;

/** Raw bytes per firmware chunk (matches backend firmware-chunk.constants.ts). */
export const FIRMWARE_CHUNK_SIZE_BYTES = 2_356_320;

export const GATEWAY_WS_PATH = '/ws/gateway';

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3000';

export function apiBaseUrl(backendUrl: string): string {
  const trimmed = backendUrl.replace(/\/+$/, '');
  return `${trimmed}/api/v1`;
}

export function wsGatewayUrl(backendUrl: string): string {
  const trimmed = backendUrl.replace(/\/+$/, '');
  const wsBase = trimmed.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}${GATEWAY_WS_PATH}`;
}
