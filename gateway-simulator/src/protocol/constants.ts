/** Default gateway WS max message — aligned with backend. */
export const GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT = 5 * 1024 * 1024;

/** Raw bytes per firmware chunk (matches backend firmware-chunk.constants.ts). */
export const FIRMWARE_CHUNK_SIZE_BYTES = 2_356_320;

export const GATEWAY_WS_PATH = '/ws/gateway';
export const GATEWAY_PROVISION_WS_PATH = '/ws/gateway-provision';
export const APP_WS_PATH = '/ws/app';

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3000';

export function apiBaseUrl(backendUrl: string): string {
  const trimmed = backendUrl.replace(/\/+$/, '');
  return `${trimmed}/api/v1`;
}

function toWsBase(backendUrl: string): string {
  const trimmed = backendUrl.replace(/\/+$/, '');
  return trimmed.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

export function wsGatewayUrl(backendUrl: string): string {
  return `${toWsBase(backendUrl)}${GATEWAY_WS_PATH}`;
}

export function wsGatewayProvisionUrl(backendUrl: string): string {
  return `${toWsBase(backendUrl)}${GATEWAY_PROVISION_WS_PATH}`;
}

/** Tenant / facility app realtime channel (`/ws/app?token=`). */
export function wsAppUrl(backendUrl: string, token: string): string {
  const url = new URL(`${toWsBase(backendUrl)}${APP_WS_PATH}`);
  url.searchParams.set('token', token);
  return url.toString();
}
