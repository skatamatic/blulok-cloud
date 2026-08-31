import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedApiClient } from '../src/main/auth/authenticated-api.client';

function jsonResponse(body: unknown, status = 200): Response {
  const payload = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => payload,
  } as Response;
}

describe('AuthenticatedApiClient', () => {
  it('requires token for authenticated requests', async () => {
    const client = new AuthenticatedApiClient({ backendUrl: 'http://localhost:3000', token: null });
    await expect(client.get('/api/v1/facilities')).rejects.toThrow(/Not logged in/);
  });

  it('sends bearer token and unwraps envelope on GET', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { facilities: [{ id: 'f1' }] } }));
    const client = new AuthenticatedApiClient({
      backendUrl: 'http://127.0.0.1:3000/',
      token: 'tok',
      fetchFn,
    });

    const data = await client.get<{ facilities: { id: string }[] }>('/api/v1/facilities');
    expect(data.facilities).toHaveLength(1);
    expect(fetchFn.mock.calls[0][1]?.headers?.Authorization).toBe('Bearer tok');
    expect(String(fetchFn.mock.calls[0][0])).toContain('/api/v1/facilities');
  });

  it('PUT and POST include JSON body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ gateway: { id: 'g1' } }));
    const client = new AuthenticatedApiClient({
      backendUrl: 'http://localhost',
      token: 'tok',
      fetchFn,
    });

    await client.put('/gateways/g1', { name: 'Renamed' });
    expect(fetchFn.mock.calls[0][1]?.method).toBe('PUT');
    expect(fetchFn.mock.calls[0][1]?.body).toBe(JSON.stringify({ name: 'Renamed' }));

    await client.post('/users', { email: 'a@b.com' });
    expect(fetchFn.mock.calls[1][1]?.method).toBe('POST');
  });

  it('surfaces API errors', async () => {
    const client = new AuthenticatedApiClient({
      backendUrl: 'http://localhost',
      token: 'tok',
      fetchFn: vi.fn().mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403)),
    });
    await expect(client.get('/gateways/g1')).rejects.toThrow('Forbidden');
  });

  it('normalizes backend URL and updates session', () => {
    const client = new AuthenticatedApiClient({ backendUrl: 'http://localhost:3000///', token: 'a' });
    expect(client.getBackendUrl()).toBe('http://localhost:3000');
    client.setBackendUrl('http://example.com/');
    client.setToken('b');
    expect(client.getBackendUrl()).toBe('http://example.com');
    expect(client.getToken()).toBe('b');
  });
});
