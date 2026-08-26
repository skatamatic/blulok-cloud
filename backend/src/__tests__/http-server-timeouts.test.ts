import http from 'http';
import {
  CLOUD_RUN_HTTP_HEADERS_TIMEOUT_MS,
  CLOUD_RUN_HTTP_KEEPALIVE_MS,
  configureLongLivedHttpServer,
} from '@/utils/http-server-timeouts';

describe('configureLongLivedHttpServer', () => {
  it('disables Node request/socket timeouts that kill WebSockets at 5 minutes', () => {
    const server = http.createServer();
    server.requestTimeout = 300_000;
    server.timeout = 120_000;

    const applied = configureLongLivedHttpServer(server);

    expect(applied).toEqual({
      requestTimeout: 0,
      timeout: 0,
      keepAliveTimeout: CLOUD_RUN_HTTP_KEEPALIVE_MS,
      headersTimeout: CLOUD_RUN_HTTP_HEADERS_TIMEOUT_MS,
    });
    expect(server.requestTimeout).toBe(0);
    expect(server.timeout).toBe(0);
    expect(server.keepAliveTimeout).toBe(CLOUD_RUN_HTTP_KEEPALIVE_MS);
    expect(server.headersTimeout).toBe(CLOUD_RUN_HTTP_HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);

    server.close();
  });
});
