import { describe, expect, it, vi } from 'vitest';
import { ProxyClient } from '../src/main/net/ProxyClient';
import { createMockTransport } from './helpers/mock-transport';

describe('ProxyClient', () => {
  it('correlates PROXY_RESPONSE by request id', async () => {
    const transport = createMockTransport();
    const client = new ProxyClient(transport, 5000);
    client.attach();

    const pending = client.request('GET', '/devices', { query: { limit: 1 } });
    const sent = transport.sent[0] as { id: string; type: string; path: string };
    expect(sent.type).toBe('PROXY_REQUEST');
    expect(sent.path).toBe('/devices');

    transport.emitMessage({ type: 'PROXY_RESPONSE', id: sent.id, status: 200, body: { ok: true } });
    const res = await pending;
    expect(res.status).toBe(200);
  });

  it('rejects on timeout', async () => {
    vi.useFakeTimers();
    const transport = createMockTransport();
    const client = new ProxyClient(transport, 100);
    client.attach();

    const pending = client.request('POST', '/slow');
    vi.advanceTimersByTime(101);
    await expect(pending).rejects.toThrow(/PROXY timeout/);
    vi.useRealTimers();
  });

  it('dispose rejects all pending requests', async () => {
    const transport = createMockTransport();
    const client = new ProxyClient(transport);
    client.attach();
    const pending = client.request('GET', '/x');
    client.dispose();
    await expect(pending).rejects.toThrow(/disposed/);
  });

  it('inventorySync and stateSync post to internal paths', async () => {
    const transport = createMockTransport();
    const client = new ProxyClient(transport);
    client.attach();

    const inv = client.inventorySync('fac-1', [{ kind: 'lock' }]);
    const st = client.stateSync('fac-1', [{ kind: 'lock' }]);
    const log = client.addLog('fac-1', 'hello');
    const ev = client.accessEvents('fac-1', [{ event_id: 'e1' }]);
    for (const msg of transport.sent as Array<{ id: string }>) {
      transport.emitMessage({ type: 'PROXY_RESPONSE', id: msg.id, status: 200, body: {} });
    }
    await inv;
    await st;
    await log;
    await ev;
    const paths = (transport.sent as Array<{ path: string }>).map((m) => m.path);
    expect(paths.some((p) => p.includes('inventory'))).toBe(true);
    expect(paths.some((p) => p.includes('state'))).toBe(true);
    expect(paths.some((p) => p.includes('add_log'))).toBe(true);
    expect(paths.some((p) => p.includes('access-events'))).toBe(true);
  });
});
