import { describe, expect, it, vi } from 'vitest';
import { BackendClient, API_PATHS } from '../src/main/auth/BackendClient';

function jsonResponse(body: unknown, status = 200): Response {
  const payload = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => payload,
  } as Response;
}

describe('BackendClient', () => {
  it('login stores token and parses user envelope', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { token: 'jwt-1', user: { id: 'u1', email: 'a@b.com', role: 'admin' } },
      }),
    );
    const client = new BackendClient(fetchFn);

    const res = await client.login({
      backendUrl: 'http://127.0.0.1:3000/',
      email: 'a@b.com',
      password: 'secret',
    });

    expect(res.token).toBe('jwt-1');
    expect(res.user.email).toBe('a@b.com');
    expect(client.getToken()).toBe('jwt-1');
    expect(client.getBackendUrl()).toBe('http://127.0.0.1:3000');
    expect(fetchFn.mock.calls[0][0]).toContain(API_PATHS.login);
  });

  it('restoreSession updates backend url and token', () => {
    const client = new BackendClient(vi.fn());
    client.restoreSession('http://example.com/', 'tok');
    expect(client.getBackendUrl()).toBe('http://example.com');
    expect(client.getToken()).toBe('tok');
  });

  it('login throws on missing token', async () => {
    const client = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(
      client.login({ backendUrl: 'http://localhost', email: 'x', password: 'y' }),
    ).rejects.toThrow(/missing token/);
  });

  it('get methods require login', async () => {
    const client = new BackendClient(vi.fn());
    await expect(client.listFacilities()).rejects.toThrow(/Not logged in/);
  });

  it('listGateways sends facility_id query', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ gateways: [{ id: 'g1', facility_id: 'f1' }] }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');

    const gateways = await client.listGateways('fac-1');
    expect(gateways).toHaveLength(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain('facility_id=fac-1');
  });

  it('getGateway and updateGateway parse gateway record', async () => {
    const record = { id: 'g1', facility_id: 'f1', name: 'GW', mac_address: 'SN-1' };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ gateway: record }))
      .mockResolvedValueOnce(jsonResponse({ gateway: { ...record, name: 'Renamed' } }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');

    expect(await client.getGateway('g1')).toEqual(record);
    expect((await client.updateGateway('g1', { name: 'Renamed' })).name).toBe('Renamed');
    expect(fetchFn.mock.calls[1][1]?.method).toBe('PUT');
  });

  it('surfaces API error messages', async () => {
    const client = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403)));
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(client.getGateway('g1')).rejects.toThrow('Forbidden');
  });

  it('listFacilities passes pagination query params', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ facilities: [] }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await client.listFacilities({ limit: 10, offset: 20 });
    expect(String(fetchFn.mock.calls[0][0])).toContain('limit=10');
    expect(String(fetchFn.mock.calls[0][0])).toContain('offset=20');
  });

  it('getGatewayStatus returns raw payload', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ online: true }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(client.getGatewayStatus('fac-1')).resolves.toEqual({ online: true });
  });

  it('listUsers parses users and total', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ users: [{ id: 'u1' }], total: 1 }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    const res = await client.listUsers({ search: 'a', role: 'admin', limit: 5, offset: 0 });
    expect(res.users).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain('search=a');
  });

  it('getUserDetail requires user record', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ user: { id: 'u1', email: 'a@b.com' } }));
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(client.getUserDetail('u1')).resolves.toMatchObject({ id: 'u1' });

    const missing = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({})));
    missing.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(missing.getUserDetail('u1')).rejects.toThrow(/missing record/);
  });

  it('mintSimulatorUserSession parses envelope and snake_case fields', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          token: 'sess-tok',
          expiresAt: 123,
          ops_public_key: 'key-b64',
          user: { id: 'u1', first_name: 'Ada', last_name: 'Lovelace', role: 'tenant' },
        },
      }),
    );
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'admin-tok');
    const res = await client.mintSimulatorUserSession('u1');
    expect(res.token).toBe('sess-tok');
    expect(res.user.firstName).toBe('Ada');
    expect(res.opsPublicKeyB64).toBe('key-b64');
  });

  it('mintSimulatorUserSession requires login', async () => {
    const client = new BackendClient(vi.fn());
    await expect(client.mintSimulatorUserSession('u1')).rejects.toThrow(/Not logged in/);
  });

  it('mintSimulatorUserSession surfaces API errors and missing token', async () => {
    const errClient = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({ message: 'Denied' }, 403)));
    errClient.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(errClient.mintSimulatorUserSession('u1')).rejects.toThrow('Denied');

    const emptyClient = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({})));
    emptyClient.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(emptyClient.mintSimulatorUserSession('u1')).rejects.toThrow(/missing token/);
  });

  it('login accepts flat token response without envelope', async () => {
    const client = new BackendClient(
      vi.fn().mockResolvedValue(jsonResponse({ token: 'flat-tok', user: { id: 'u1', email: 'a@b.com', role: 'admin' } })),
    );
    const res = await client.login({ backendUrl: 'http://localhost', email: 'a@b.com', password: 'x' });
    expect(res.token).toBe('flat-tok');
    expect(res.user.role).toBe('admin');
  });

  it('login throws on API error', async () => {
    const client = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({ message: 'Bad creds' }, 401)));
    await expect(
      client.login({ backendUrl: 'http://localhost', email: 'x', password: 'y' }),
    ).rejects.toThrow('Bad creds');
  });

  it('getGateway throws when record missing', async () => {
    const client = new BackendClient(vi.fn().mockResolvedValue(jsonResponse({})));
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(client.getGateway('g1')).rejects.toThrow(/missing record/);
  });

  it('updateGateway accepts flat gateway response', async () => {
    const record = { id: 'g1', facility_id: 'f1', name: 'GW', mac_address: 'SN-1' };
    const client = new BackendClient(vi.fn().mockResolvedValue(jsonResponse(record)));
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    await expect(client.updateGateway('g1', { name: 'GW' })).resolves.toEqual(record);
  });

  it('mintSimulatorUserSession handles optional user email and empty ops key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        token: 'sess',
        user: { id: 'u1', role: 'tenant' },
        ops_public_key: '',
      }),
    );
    const client = new BackendClient(fetchFn);
    client.restoreSession('http://127.0.0.1:3000', 'tok');
    const res = await client.mintSimulatorUserSession('u1');
    expect(res.user.email).toBeNull();
    expect(res.opsPublicKeyB64).toBeUndefined();
  });
});
