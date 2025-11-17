/* eslint-disable no-console */
const axios = require('axios').default;
const WebSocket = require('ws');

// Default to backend's default port (3000). Override with API_BASE_URL / WS_URL.
const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws/gateway';
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';

axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS) || 10000;

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function login() {
  console.log('🔐 Logging in as dev admin...');
  const res = await axios.post(`${API_BASE}/auth/login`, { email: EMAIL, password: PASSWORD }).catch((err) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = err?.message || String(err);
    const code = err?.code;
    console.error('Login failed:', { status, code, data, msg, apiBase: API_BASE });
    console.error('Hint: ensure the backend is running locally and API_BASE_URL points to it (e.g., http://127.0.0.1:3001/api/v1)');
    throw err;
  });
  if (!res.data?.token) {
    throw new Error('Login succeeded but no token returned');
  }
  console.log('✅ Login OK');
  return res.data.token;
}

async function getFirstFacility(token) {
  console.log('🏢 Fetching facilities...');
  const res = await axios.get(`${API_BASE}/facilities`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 1 }
  });
  const facilities = res.data?.facilities || res.data?.items || res.data || [];
  const facility = Array.isArray(facilities) ? facilities[0] : facilities.facilities?.[0];
  if (!facility?.id) {
    throw new Error('No facilities found to test with');
  }
  console.log(`✅ Facility OK (${facility.id})`);
  return facility.id;
}

function awaitMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);
    const onMsg = (data) => {
      try {
        const msg = JSON.parse(data);
        if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      } catch {
        // ignore
      }
    };
    const onErr = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onErr);
    };
    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

async function testWebSocket(token, facilityId) {
  console.log('🔌 Connecting to WebSocket gateway...', WS_URL);
  const ws = new WebSocket(WS_URL);

  // Instrument connection for better diagnostics
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg?.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
        console.log('↔️  Heartbeat: PING→PONG');
      }
    } catch {
      // ignore
    }
  });
  ws.on('unexpected-response', (_req, res) => {
    console.error('WS unexpected response:', res.statusCode, res.statusMessage);
  });
  ws.on('close', (code, reason) => {
    console.log(`WS closed code=${code} reason=${reason?.toString?.() || reason}`);
  });
  ws.on('error', (err) => {
    console.error('WS error:', err?.message || err);
  });

  // Connection timeout guard
  await Promise.race([
    new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('WS open timeout')), Number(process.env.WS_CONNECT_TIMEOUT_MS) || 8000)
    ),
  ]);
  console.log('✅ WS connected');

  // AUTH
  ws.send(JSON.stringify({ type: 'AUTH', token, facilityId }));
  const authOk = await awaitMessage(ws, (m) => m.type === 'AUTH_OK' && m.facilityId === facilityId);
  if (!authOk) throw new Error('AUTH failed');
  console.log('✅ WS AUTH_OK');

  // PROXY: GET facilities/:id
  const reqId = 'req-1';
  ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqId, method: 'GET', path: `/facilities/${facilityId}` }));
  const resp = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === reqId);
  if (resp.status !== 200) throw new Error(`Proxy GET facility failed: ${resp.status}`);
  console.log('✅ WS PROXY GET facility OK');

  // PROXY: GET devices list scoped to facility
  const req2 = 'req-2';
  ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: req2, method: 'GET', path: `/devices`, query: { facility_id: facilityId, limit: 1 } }));
  const resp2 = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === req2);
  if (resp2.status !== 200) throw new Error(`Proxy GET devices failed: ${resp2.status}`);
  console.log('✅ WS PROXY GET devices OK');

  const firstDeviceId = resp2.body?.devices?.[0]?.id;

  // PROXY: GET internal/gateway/time-sync
  const req3 = 'req-3';
  ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: req3, method: 'GET', path: `/internal/gateway/time-sync` }));
  const resp3 = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === req3);
  if (resp3.status !== 200 || !resp3.body?.success) throw new Error(`Proxy GET time-sync failed: ${resp3.status}`);
  console.log('✅ WS PROXY GET time-sync OK');

  // PROXY: POST internal/gateway/request-time-sync (if we have a device/lock id)
  if (firstDeviceId) {
    const req4 = 'req-4';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST', id: req4, method: 'POST', path: `/internal/gateway/request-time-sync`,
      body: { lock_id: firstDeviceId }
    }));
    const resp4 = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === req4);
    if (resp4.status !== 200 || !resp4.body?.success) {
      console.warn('⚠️  WS PROXY POST request-time-sync returned non-200 or unsuccessful:', resp4.status);
    } else {
      console.log('✅ WS PROXY POST request-time-sync OK');
    }
  } else {
    console.warn('⚠️  No devices found to test request-time-sync');
  }

  // PROXY: GET device denylist (try both endpoints, prefer devices route)
  if (firstDeviceId) {
    const req5 = 'req-5';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: req5, method: 'GET', path: `/devices/blulok/${firstDeviceId}/denylist` }));
    const resp5 = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === req5);
    if (resp5.status === 200) {
      console.log('✅ WS PROXY GET device denylist (devices route) OK');
    } else {
      // Try denylist route as fallback
      const req5b = 'req-5b';
      ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: req5b, method: 'GET', path: `/denylist/devices/${firstDeviceId}` }));
      const resp5b = await awaitMessage(ws, (m) => m.type === 'PROXY_RESPONSE' && m.id === req5b);
      if (resp5b.status !== 200) throw new Error(`Proxy GET device denylist failed: ${resp5.status}/${resp5b.status}`);
      console.log('✅ WS PROXY GET device denylist (denylist route) OK');
    }
  }

  // Heartbeat sustain check: wait a bit to observe PING/PONG exchange
  await delay(1500);

  // Graceful close
  await delay(100);
  try { ws.close(); } catch {}
  return ws;
}

(async () => {
  let wsRef = null;
  const cleanup = () => {
    try { if (wsRef && wsRef.readyState === WebSocket.OPEN) wsRef.close(1000, 'client_exit'); } catch {}
  };
  process.on('SIGINT', () => { console.log('\nCaught SIGINT, closing WS...'); cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { console.log('\nCaught SIGTERM, closing WS...'); cleanup(); process.exit(143); });
  process.on('uncaughtException', (err) => { console.error('Uncaught exception:', err); cleanup(); process.exit(1); });
  process.on('unhandledRejection', (reason) => { console.error('Unhandled rejection:', reason); cleanup(); process.exit(1); });

  try {
    console.log('=== WS Gateway Test ===');
console.log(`API_BASE_URL=${API_BASE}`);
console.log(`WS_URL=${WS_URL}`);

// Quick connectivity probe (should return 404 for GET /auth/login if reachable)
try {
  const probe = await axios.get(`${API_BASE}/auth/login`, { validateStatus: () => true });
  console.log(`Probe GET /auth/login -> status ${probe.status}`);
} catch (probeErr) {
  console.error('Connectivity probe failed (cannot reach API_BASE_URL):', {
    code: probeErr?.code,
    message: probeErr?.message
  });
}

const token = await login();
    const facilityId = await getFirstFacility(token);

    // Basic HTTP check
    const whoami = await axios.get(`${API_BASE}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } }).catch((err) => {
      console.error('Profile check failed:', { status: err?.response?.status, data: err?.response?.data, msg: err?.message });
      throw err;
    });
    console.log(`👤 Authenticated as: ${whoami.data?.user?.email || whoami.data?.user?.login_identifier || 'unknown'}`);

    wsRef = await testWebSocket(token, facilityId);
    console.log('🎉 All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err?.response?.data || err?.message || String(err));
    process.exit(1);
  }
})();


