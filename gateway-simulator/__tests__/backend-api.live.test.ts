/**
 * Live integration tests against a running backend.
 * Skipped when SKIP_LIVE_TESTS=1 or backend is unreachable.
 *
 * Run: npm run test:live-api
 * Requires: backend on http://127.0.0.1:3000 (or API_BASE_URL)
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { BackendClient } from '../src/main/auth/BackendClient';
import { DEFAULT_BACKEND_URL } from '../src/protocol/constants';

const BACKEND_URL = process.env.API_BASE_URL?.replace(/\/api\/v1\/?$/, '') ?? DEFAULT_BACKEND_URL;
const EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? 'DevAdmin123!@#';
const SKIP = process.env.SKIP_LIVE_TESTS === '1';

async function backendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'probe@invalid.local', password: 'x' }),
    });
    // Any HTTP response means the server is up (401/400 expected for bad creds)
    return res.status > 0;
  } catch {
    return false;
  }
}

const live = SKIP ? describe.skip : describe;

live('backend API (live)', () => {
  let client: BackendClient;
  let facilityId: string;

  beforeAll(async () => {
    const up = await backendReachable();
    if (!up) {
      throw new Error(`Backend not reachable at ${BACKEND_URL} — start backend or set SKIP_LIVE_TESTS=1`);
    }
    client = new BackendClient();
    await client.login({ backendUrl: BACKEND_URL, email: EMAIL, password: PASSWORD });
    const facilities = await client.listFacilities({ limit: 10 });
    if (!facilities.length) {
      throw new Error('No facilities returned — seed data required for live API tests');
    }
    facilityId = facilities[0].id;
  }, 30000);

  it('login returns token and user', async () => {
    expect(client.getToken()).toBeTruthy();
  });

  it('GET /facilities accepts limit query param', async () => {
    const facilities = await client.listFacilities({ limit: 5 });
    expect(Array.isArray(facilities)).toBe(true);
  });

  it('GET /gateways?facility_id= does not reject unknown query params', async () => {
    // Regression: gatewayListQuerySchema only allows facility_id (no limit)
    const gateways = await client.listGateways(facilityId);
    expect(Array.isArray(gateways)).toBe(true);
  });

  it('GET /gateways/status/:facilityId returns gateway status payload', async () => {
    const status = await client.getGatewayStatus(facilityId);
    expect(status).toBeDefined();
  });
});
