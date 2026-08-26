import type { Server } from 'http';

/**
 * Cloud Run's Google Front End reuses HTTP connections for ~600s.
 * Node's default keepAliveTimeout (5s) closes the socket first and yields 502s.
 * headersTimeout must stay strictly above keepAliveTimeout (Node.js constraint).
 */
export const CLOUD_RUN_HTTP_KEEPALIVE_MS = 700_000;
export const CLOUD_RUN_HTTP_HEADERS_TIMEOUT_MS = 710_000;

export interface LongLivedHttpServerTimeouts {
  requestTimeout: number;
  headersTimeout: number;
  timeout: number;
  keepAliveTimeout: number;
}

/**
 * Node.js 18+ defaults `requestTimeout` to 300_000ms. That timer is wall-clock
 * from the HTTP request start and does **not** reset on WebSocket frames, so
 * `/ws`, `/ws/app`, and `/ws/gateway` die at ~5 minutes even when Cloud Run
 * `--timeout` is 3600 and heartbeats are flowing.
 *
 * Disable Node request/socket timeouts so Cloud Run remains the lifetime cap.
 */
export function configureLongLivedHttpServer(server: Server): LongLivedHttpServerTimeouts {
  server.requestTimeout = 0;
  server.timeout = 0;
  server.keepAliveTimeout = CLOUD_RUN_HTTP_KEEPALIVE_MS;
  server.headersTimeout = CLOUD_RUN_HTTP_HEADERS_TIMEOUT_MS;
  return {
    requestTimeout: server.requestTimeout,
    headersTimeout: server.headersTimeout,
    timeout: server.timeout,
    keepAliveTimeout: server.keepAliveTimeout,
  };
}
