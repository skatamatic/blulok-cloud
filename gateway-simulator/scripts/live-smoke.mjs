/**
 * End-to-end smoke: login → facilities → gateways → WS AUTH.
 * Usage: node scripts/live-smoke.mjs
 */
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

const BACKEND = process.env.API_BASE_URL?.replace(/\/api\/v1\/?$/, '') || 'http://127.0.0.1:3000';
const API = `${BACKEND}/api/v1`;
const WS = `${BACKEND.replace(/^http/, 'ws')}/ws/gateway`;
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';

async function assertOk(res, label) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${body.message || body.error || JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('Login…');
  const loginBody = await assertOk(
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }),
    'login',
  );
  const token = loginBody.data?.token ?? loginBody.token;

  console.log('List facilities (limit=5)…');
  const facBody = await assertOk(
    await fetch(`${API}/facilities?limit=5`, { headers: { Authorization: `Bearer ${token}` } }),
    'list facilities',
  );
  const facilities = facBody.facilities ?? facBody.data?.facilities ?? [];
  if (!facilities.length) throw new Error('No facilities available');
  const facilityId = facilities[0].id;
  console.log(`  → ${facilities[0].name} (${facilityId})`);

  console.log('List gateways (facility_id only, no limit)…');
  const gwBody = await assertOk(
    await fetch(`${API}/gateways?facility_id=${encodeURIComponent(facilityId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    'list gateways',
  );
  const gateways = gwBody.gateways ?? gwBody.data?.gateways ?? [];
  console.log(`  → ${gateways.length} gateway record(s)`);

  console.log('Gateway status…');
  const statusBody = await assertOk(
    await fetch(`${API}/gateways/status/${encodeURIComponent(facilityId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    'gateway status',
  );
  console.log(`  → status payload keys: ${Object.keys(statusBody.data ?? statusBody).join(', ')}`);

  const gatewayId = randomUUID();
  console.log(`Connect WS ${WS}…`);
  const ws = new WebSocket(WS);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });

  const authOk = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AUTH timeout')), 10000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'AUTH_OK') {
        clearTimeout(t);
        resolve(msg);
      } else if (msg.type === 'ERROR') {
        clearTimeout(t);
        reject(new Error(msg.message));
      }
    });
  });

  ws.send(JSON.stringify({ type: 'AUTH', token, facilityId, gatewayId }));
  const ok = await authOk;
  console.log('AUTH_OK', ok.sessionRole, ok.autoRegistered);

  ws.close();
  console.log('Live smoke OK');
}

main().catch((err) => {
  console.error('Live smoke FAILED:', err.message);
  process.exit(1);
});
