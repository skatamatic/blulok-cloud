import { describe, expect, it } from 'vitest';
import { apiBaseUrl, wsGatewayUrl, GATEWAY_WS_PATH } from '../src/protocol/constants';

describe('protocol constants', () => {
  it('apiBaseUrl strips trailing slashes', () => {
    expect(apiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000/api/v1');
  });

  it('wsGatewayUrl converts http(s) to ws(s)', () => {
    expect(wsGatewayUrl('https://cloud.example.com')).toBe(`wss://cloud.example.com${GATEWAY_WS_PATH}`);
    expect(wsGatewayUrl('http://127.0.0.1:3000')).toBe(`ws://127.0.0.1:3000${GATEWAY_WS_PATH}`);
  });
});
