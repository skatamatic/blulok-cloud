import { describe, expect, it, vi } from 'vitest';
import { MobileApiClient } from '../src/main/auth/MobileApiClient';

describe('MobileApiClient', () => {
  it('login sends identifier and optional device headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: 'jwt',
        user: { id: 'u1', email: 't@t.com', role: 'tenant' },
        ops_public_key: 'ops',
      }),
    });
    const client = new MobileApiClient(fetchFn as never);
    const result = await client.login('http://127.0.0.1:3000', 't@t.com', 'pass', 'phone-1', 'ios');
    expect(result.token).toBe('jwt');
    expect(result.opsPublicKeyB64).toBe('ops');
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-App-Device-Id']).toBe('phone-1');
  });

  it('registerKey posts public key', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        device: { id: 'd1', app_device_id: 'phone-1', public_key: 'pk' },
      }),
    });
    const client = new MobileApiClient(fetchFn as never);
    const result = await client.registerKey('http://127.0.0.1:3000', 'tok', {
      appDeviceId: 'phone-1',
      platform: 'ios',
      deviceName: 'Phone',
      publicKeyB64: 'pk',
    });
    expect(result.deviceId).toBe('d1');
  });

  it('login throws on HTTP error', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    });
    const client = new MobileApiClient(fetchFn as never);
    await expect(client.login('http://127.0.0.1:3000', 'a@b.c', 'bad')).rejects.toThrow('Invalid credentials');
  });

  it('requestRoutePass returns jwt', async () => {
    const payload = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url');
    const jwt = `h.${payload}.s`;
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, routePass: jwt }),
    });
    const client = new MobileApiClient(fetchFn as never);
    const result = await client.requestRoutePass('http://127.0.0.1:3000', 'tok', 'phone-1', 'fac-1');
    expect(result.routePass).toBe(jwt);
    expect(result.expiresAt).toBe(9999999999);
  });
});
