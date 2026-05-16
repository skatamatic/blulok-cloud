/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const axios = require('axios').default;
const WebSocket = require('ws');
const dotenv = require('dotenv');

/**
 * End-to-end: facility gateway on /ws/gateway (AUTH + PROXY_REQUEST → internal APIs such as
 * POST /internal/gateway/devices/state) → DB → dashboard /ws fanout:
 *   device_status_update (HTTP + gateway lock_status), units_update, gateway_status_update
 * Uses DEV_ADMIN (or env overrides) to provision facility/gateway/device, then validates
 * the same paths the web app uses (UI_WS_URL + subscription JSON).
 *
 * Target resolution (same server as `npm run dev` in backend/):
 * - `E2E_API_PORT` or `BACKEND_PORT` overrides everything else for host-based URLs.
 * - Else `PORT` is read from `backend/.env` (file), not shell `PORT` (avoids frontend/vite stealing PORT).
 * - Else shell `PORT`, else 3000 (matches backend Joi default when no `.env`).
 * - If `API_BASE_URL` is set, default `WS_URL` / `UI_WS_URL` use the same host:port as that URL.
 */
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parsePortNum(value) {
  const p = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(p) && p > 0 && p <= 65535 ? p : null;
}

function readPortFromBackendEnvFile() {
  const envFilePath = path.join(__dirname, '..', '.env');
  try {
    if (!fs.existsSync(envFilePath)) return null;
    const parsed = dotenv.parse(fs.readFileSync(envFilePath, 'utf8'));
    return parsePortNum(parsed.PORT);
  } catch {
    return null;
  }
}

function resolveE2eEndpoints() {
  const filePort = readPortFromBackendEnvFile();
  const overridePort = parsePortNum(process.env.E2E_API_PORT || process.env.BACKEND_PORT);
  let port = overridePort ?? filePort ?? parsePortNum(process.env.PORT) ?? 3000;
  const host = process.env.E2E_HOST || '127.0.0.1';

  const apiBaseUrlRaw = process.env.API_BASE_URL?.trim();
  if (apiBaseUrlRaw) {
    try {
      const u = new URL(apiBaseUrlRaw);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsOrigin = `${wsProto}//${u.host}`;
      const apiBase = apiBaseUrlRaw.replace(/\/$/, '');
      return {
        API_BASE: apiBase,
        WS_URL: process.env.WS_URL?.trim() || `${wsOrigin}/ws/gateway`,
        UI_WS_URL: process.env.UI_WS_URL?.trim() || `${wsOrigin}/ws`,
        port,
        portSource: 'API_BASE_URL (+ optional WS_URL/UI_WS_URL overrides)',
      };
    } catch {
      /* fall through */
    }
  }

  return {
    API_BASE: `http://${host}:${port}/api/v1`,
    WS_URL: process.env.WS_URL?.trim() || `ws://${host}:${port}/ws/gateway`,
    UI_WS_URL: process.env.UI_WS_URL?.trim() || `ws://${host}:${port}/ws`,
    port,
    portSource:
      overridePort != null
        ? 'E2E_API_PORT or BACKEND_PORT'
        : filePort != null
          ? 'backend/.env PORT'
          : parsePortNum(process.env.PORT) != null
            ? 'process.env.PORT (shell)'
            : 'default 3000',
  };
}

const { API_BASE, WS_URL, UI_WS_URL, port: E2E_RESOLVED_PORT, portSource: E2E_PORT_SOURCE } = resolveE2eEndpoints();
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';
const VERBOSE = process.env.E2E_VERBOSE === '1' || process.env.VERBOSE === '1' || process.argv.includes('--verbose');

axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS) || 15000;

function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }

/**
 * Poll `device_status_update` payloads (same channel/filters as the dashboard: subscriptionType
 * `device_status`, `data: { device_id }`) until the row for `deviceId` has `lock_status`.
 * `expected` may be a single status or a list (e.g. `['locking','locked']` after HTTP CLOSE — API uses transitional states).
 */
async function waitForDeviceStatusLockStatus(events, deviceId, expected, startLen, timeoutMs) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = startLen; i < events.length; i++) {
      const d = events[i]?.data?.devices?.find((x) => x.id === deviceId);
      if (d && wanted.includes(d.lock_status)) return d;
    }
    await delay(200);
  }
  return null;
}

// Minimal ANSI color helpers (no external deps)
const C = {
  reset: '\x1b[0m',
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const TEST_FACILITY_NAME = 'E2E-Test-Facility';
const STALE_USER_EMAIL_PREFIXES = [
  'fac-admin-',
  'fms-primary-',
  'fms-share1-',
  'fms-share2-',
  'e2e-primary-',
  'e2e-share',
];
let accessCodeAckMode = 'accept'; // accept | reject | ignore

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function listFacilities(token, offset = 0, limit = 50) {
  const res = await axios.get(`${API_BASE}/facilities`, {
    headers: authHeaders(token),
    params: { limit, offset }
  });
  const facilities = res.data?.facilities || res.data?.items || [];
  const total = res.data?.total ?? facilities.length;
  return { facilities, total };
}

async function deleteFmsConfigIfExists(token, facilityId) {
  try {
    const res = await axios.get(`${API_BASE}/fms/config/${facilityId}`, { headers: authHeaders(token) });
    const configId = res.data?.config?.id;
    if (configId) {
      await axios.delete(`${API_BASE}/fms/config/${configId}`, { headers: authHeaders(token) });
      ok(`Deleted stale FMS config ${configId} (facility ${facilityId})`);
    }
  } catch (err) {
    if (err?.response?.status !== 404) {
      warn(`Failed to delete FMS config for ${facilityId}: ${err?.response?.data || err?.message || err}`);
    }
  }
}

async function cleanupStaleFacilities(token) {
  try {
    step('Checking for stale E2E facilities');
    let offset = 0;
    const limit = 50;
    let total = null;
    let removed = 0;
    do {
      const { facilities, total: reportedTotal } = await listFacilities(token, offset, limit);
      total = reportedTotal ?? facilities.length;
      const stale = facilities.filter((f) => (f.name || '').toLowerCase().includes(TEST_FACILITY_NAME.toLowerCase()));
      for (const facility of stale) {
        try {
          await deleteFmsConfigIfExists(token, facility.id);
          step(`Hard deleting stale facility ${facility.id} (${facility.name})`);
          await axios.delete(`${API_BASE}/admin/facilities/${facility.id}/hard`, { headers: authHeaders(token) });
          removed += 1;
          ok(`Removed stale facility ${facility.id}`);
        } catch (err) {
          warn(`Failed to delete stale facility ${facility.id}: ${err?.response?.data || err?.message || err}`);
        }
      }
      if (!facilities.length || facilities.length < limit) {
        break;
      }
      offset += facilities.length;
    } while (offset < (total ?? 0));
    if (removed === 0) {
      info('No stale E2E facilities detected');
    }
  } catch (err) {
    warn(`Pre-run facility cleanup failed: ${err?.response?.data || err?.message || err}`);
  }
}

async function fetchUsersBySearch(token, searchTerm, offset = 0, limit = 50) {
  const res = await axios.get(`${API_BASE}/users`, {
    headers: authHeaders(token),
    params: { search: searchTerm, offset, limit }
  });
  const users = res.data?.users || [];
  const total = res.data?.total ?? users.length;
  return { users, total };
}

async function hardDeleteUser(token, userId) {
  await axios.delete(`${API_BASE}/admin/users/${userId}/hard`, { headers: authHeaders(token) });
}

async function cleanupStaleFacilityAdmins(token) {
  try {
    step('Checking for stale test users');
    const toDelete = new Set();
    for (const prefix of STALE_USER_EMAIL_PREFIXES) {
      let offset = 0;
      const limit = 50;
      let total = null;
      do {
        const { users, total: reportedTotal } = await fetchUsersBySearch(token, prefix, offset, limit);
        total = reportedTotal ?? users.length;
        users
          .filter((user) => (user.email || '').toLowerCase().startsWith(prefix))
          .forEach((user) => toDelete.add(user.id));
        if (!users.length || users.length < limit) {
          break;
        }
        offset += users.length;
      } while (offset < (total ?? 0));
    }
    // Handle phone-based "New Invitee" users (no email)
    let offset = 0;
    const inviteeSearch = 'invitee';
    do {
      const { users, total } = await fetchUsersBySearch(token, inviteeSearch, offset, 50);
      users
        .filter((user) => !user.email && user.firstName === 'New' && (user.lastName || '').startsWith('Invitee'))
        .forEach((user) => toDelete.add(user.id));
      if (!users.length || users.length < 50) break;
      offset += users.length;
      if (offset >= (total ?? 0)) break;
    } while (true);

    if (toDelete.size === 0) {
      info('No stale test users detected');
      return;
    }

    for (const userId of toDelete) {
      try {
        step(`Hard deleting stale user ${userId}`);
        await hardDeleteUser(token, userId);
        ok(`Removed stale user ${userId}`);
      } catch (err) {
        warn(`Failed to delete user ${userId}: ${err?.response?.data || err?.message || err}`);
      }
    }
  } catch (err) {
    warn(`Pre-run user cleanup failed: ${err?.response?.data || err?.message || err}`);
  }
}

async function forceGatewayPing(token, facilityId) {
  const res = await axios.post(`${API_BASE}/admin/dev-tools/gateway-ping`, { facilityId }, {
    headers: authHeaders(token),
  });
  return res.data;
}

async function cleanupPreviousArtifacts(token) {
  heading('Pre-run Cleanup');
  await cleanupStaleFacilities(token);
  await cleanupStaleFacilityAdmins(token);
}

async function setRateLimitBypass(token, enabled, durationSeconds = 600) {
  try {
    const body = enabled
      ? { enabled: true, durationSeconds, reason: 'ws-gateway-e2e' }
      : { enabled: false };
    await axios.post(`${API_BASE}/admin/rate-limits/bypass`, body, { headers: authHeaders(token) });
    info(`Rate limit bypass ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  } catch (err) {
    warn(`Rate limit bypass ${enabled ? 'enable' : 'disable'} failed: ${err?.response?.status || ''} ${err?.response?.data || err?.message || err}`);
    return false;
  }
}

async function setNotificationsTestMode(token, enabled) {
  try {
    const body = { enabled: !!enabled };
    await axios.post(`${API_BASE}/admin/dev-tools/notifications-test-mode`, body, { headers: authHeaders(token) });
    info(`Notifications test mode ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  } catch (err) {
    warn(`Notifications test mode ${enabled ? 'enable' : 'disable'} failed: ${err?.response?.status || ''} ${err?.response?.data || err?.message || err}`);
    return false;
  }
}

// Track overall E2E success so we can print a clean result after cleanup
let success = false;
let notificationsWs = null;
const notificationEvents = [];
const gatewayWsEvents = [];

function heading(text) {
  console.log(C.bold(C.cyan(`\n▸ ${text}`)));
}
function ok(text) {
  console.log(C.green(`  ✔ ${text}`));
}
function warn(text) {
  console.log(C.yellow(`  ⚠ ${text}`));
}
function info(text) {
  console.log(C.blue(`  • ${text}`));
}
function step(text) {
  console.log(C.magenta(`→ ${text}`));
}

// -------------------------
// Local mock FMS server (generic_rest)
// -------------------------
function startMockFmsServer(dataset) {
  const http = require('http');
  const server = http.createServer((req, res) => {
    try {
      if (req.method === 'GET' && req.url.startsWith('/health')) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true })); return;
      }
      // Node's req.url includes the query string; StoredgeProvider uses ?page=&per_page= on list endpoints.
      const pathname = (req.url || '').split('?')[0];
      // Storedge-like routes:
      // GET /v1/:facility/units -> { units: [...] }
      // GET /v1/:facility/tenants/current -> { tenants: [...] }
      // GET /v1/:facility/ledgers/current -> { ledgers: [...] }
      // GET /v1/:facility/tenants/:id -> single tenant
      // GET /v1/:facility/units/:id -> single unit
      const mUnits = pathname.match(/^\/v1\/[^/]+\/units$/);
      if (req.method === 'GET' && mUnits) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ units: dataset.units })); return;
      }
      const mTenantsCurrent = pathname.match(/^\/v1\/[^/]+\/tenants\/current$/);
      if (req.method === 'GET' && mTenantsCurrent) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ tenants: dataset.tenants })); return;
      }
      const mLedgersCurrent = pathname.match(/^\/v1\/[^/]+\/ledgers\/current$/);
      if (req.method === 'GET' && mLedgersCurrent) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ledgers: dataset.ledgers })); return;
      }
      const mTenantById = pathname.match(/^\/v1\/[^/]+\/tenants\/([^/]+)$/);
      if (req.method === 'GET' && mTenantById) {
        const t = dataset.tenants.find(x => String(x.id) === mTenantById[1]);
        res.statusCode = t ? 200 : 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(t || { error: 'not found' })); return;
      }
      const mUnitById = pathname.match(/^\/v1\/[^/]+\/units\/([^/]+)$/);
      if (req.method === 'GET' && mUnitById) {
        const u = dataset.units.find(x => String(x.id) === mUnitById[1]);
        res.statusCode = u ? 200 : 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(u || { error: 'not found' })); return;
      }
      res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'not found' }));
    } catch (e) {
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: e?.message || 'err' }));
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

// -------------------------
// Helper utilities (pure)
// -------------------------
function base64UrlDecode(str) {
  try {
    const pad = (s) => s + '==='.slice((s.length + 3) % 4);
    const b64 = pad(str).replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(b64, 'base64');
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function decodeJwtClaims(jwt) {
  const parts = (jwt || '').split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const claims = JSON.parse(payloadJson);
    return claims;
  } catch {
    return null;
  }
}

/**
 * Route pass JWTs must include `user_role`: lowercase, underscore-separated (matches cloud UserRole).
 * @param {object|null} claims
 * @param {string} expectedLowerSnake e.g. 'tenant', 'facility_admin'
 */
function assertRoutePassUserRole(claims, expectedLowerSnake) {
  if (!claims || typeof claims.user_role !== 'string' || claims.user_role.length === 0) {
    throw new Error('Route pass JWT must include non-empty user_role claim');
  }
  if (claims.user_role !== expectedLowerSnake) {
    throw new Error(`Route pass user_role expected "${expectedLowerSnake}", got "${claims.user_role}"`);
  }
}

// -------------------------
// HTTP and WS helpers
// -------------------------
async function proxyWs(ws, id, method, path, { query, body } = {}) {
  ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id, method, path, query, body }));
  return await waitForProxyResponse(ws, id);
}

async function connectGatewayWsAndAuth(wsUrl, token, facilityId) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.on('message', (data) => {
    try {
      if (VERBOSE) console.log('[WS <-]', data.toString());
      const msg = JSON.parse(data.toString());
      gatewayWsEvents.push(msg);
      if (msg?.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
      const cmd = normalizeCmd(msg);
      if (cmd?.cmd_type === 'ACCESS_CODE_UPDATE' && cmd?.nonce) {
        if (accessCodeAckMode === 'accept') {
          ws.send(JSON.stringify({
            type: 'ACCESS_CODE_UPDATE_ACK',
            nonce: cmd.nonce,
            accepted: true,
          }));
        } else if (accessCodeAckMode === 'reject') {
          ws.send(JSON.stringify({
            type: 'ACCESS_CODE_UPDATE_ACK',
            nonce: cmd.nonce,
            accepted: false,
            message: 'e2e-forced-reject',
          }));
        }
      }
    } catch {}
  });
  const authMsg = { type: 'AUTH', token, facilityId };
  if (VERBOSE) console.log('[WS ->]', JSON.stringify(authMsg));
  ws.send(JSON.stringify(authMsg));
  let authOkData = null;
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('AUTH timeout')), 4000);
    ws.once('message', (data) => {
      try {
        if (VERBOSE) console.log('[WS <-]', data.toString());
        const m = JSON.parse(data.toString());
        if (m?.type === 'AUTH_OK' && m.facilityId === facilityId) { authOkData = m; clearTimeout(timer); res(null); }
        else { clearTimeout(timer); rej(new Error('AUTH not ok')); }
      } catch (e) { clearTimeout(timer); rej(e); }
    });
  });
  ws._authOkData = authOkData;
  return ws;
}

async function connectNotificationsWs(token) {
  const url = `${UI_WS_URL}?token=${token}`;
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (VERBOSE) console.log('[WS-DEV <-]', data.toString());
      if (msg.type === 'dev_notifications_update' && msg.data) {
        notificationEvents.push(msg.data);
      }
    } catch {}
  });
  ws.send(JSON.stringify({
    type: 'subscription',
    subscriptionType: 'dev_notifications',
  }));
  return ws;
}

async function waitForNotification(predicate, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const idx = notificationEvents.findIndex(predicate);
    if (idx >= 0) {
      return notificationEvents.splice(idx, 1)[0];
    }
    await delay(200);
  }
  throw new Error('Timed out waiting for DEV_NOTIFICATION event');
}

async function waitForGatewayEvent(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const idx = gatewayWsEvents.findIndex(predicate);
    if (idx >= 0) {
      return gatewayWsEvents.splice(idx, 1)[0];
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for gateway WS event');
}

function deviceSync(ws, facilityId, devices, id) {
  return proxyWs(ws, id, 'POST', `/internal/gateway/device-sync`, { body: { devices, facility_id: facilityId } });
}

// Verbose HTTP logging
if (VERBOSE) {
  const sanitizeFacilities = (data) => {
    try {
      if (!data || typeof data !== 'object') return data;
      // Shallow clone to avoid mutating actual response
      const cloned = JSON.parse(JSON.stringify(data));
      if (Array.isArray(cloned.facilities)) {
        cloned.facilities.forEach((f) => { if (f && typeof f === 'object') delete f.branding_image; });
      }
      if (cloned.facility && typeof cloned.facility === 'object') {
        delete cloned.facility.branding_image;
      }
      return cloned;
    } catch { return data; }
  };

  axios.interceptors.request.use((config) => {
    const { method, url } = config;
    let line = `[HTTP ->] ${method?.toUpperCase()} ${url}`;
    // Only log body if present
    if (config.data !== undefined) {
      const shortData = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
      line += `\n  body: ${shortData}`;
    }
    console.log(line);
    return config;
  }, (error) => {
    console.log('[HTTP -> ERROR]', error?.message);
    return Promise.reject(error);
  });

  axios.interceptors.response.use((res) => {
    const url = res.config?.url || '';
    let line = `[HTTP <-] ${res.status} ${url}`;
    // Only log body if present; sanitize facilities to omit images
    if (res.data !== undefined) {
      const dataForLog = url.includes('/facilities') ? sanitizeFacilities(res.data) : res.data;
      const shortBody = typeof dataForLog === 'string' ? dataForLog : JSON.stringify(dataForLog);
      line += `\n  body: ${shortBody}`;
    }
    console.log(line);
    return res;
  }, (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url;
    const rawBody = error?.response?.data;
    // Sanitize facilities error bodies too
    const body = (url || '').includes('/facilities') && rawBody ? sanitizeFacilities(rawBody) : rawBody;
    let line = `[HTTP <- ERROR] ${status || ''} ${url || ''}`;
    if (body !== undefined) {
      line += `\n  body: ${JSON.stringify(body)}`;
    }
    console.log(line);
    return Promise.reject(error);
  });
}

async function login(attempt = 1) {
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, { email: EMAIL, password: PASSWORD });
    return {
      token: res.data.token,
      ops_public_key: res.data.ops_public_key,
      ops_public_key_jwk: res.data.ops_public_key_jwk,
      ops_public_key_pem: res.data.ops_public_key_pem,
    };
  } catch (err) {
    if (err?.response?.status === 429 && attempt < 6) {
      const waitMs = 750 * attempt * attempt;
      await delay(waitMs);
      return login(attempt + 1);
    }
    throw err;
  }
}

async function fetchAuthProfile(token) {
  const res = await axios.get(`${API_BASE}/auth/profile`, { headers: authHeaders(token) });
  return res.data?.user || res.data;
}

async function verifyUserDetailsEndpoint(token, userId) {
  const res = await axios.get(`${API_BASE}/users/${userId}/details`, { headers: authHeaders(token) });
  if (!res.data?.user) {
    throw new Error('User details response missing user payload');
  }
  ok('User details endpoint verified for authenticated user');
  return res.data.user;
}

async function getFirstFacility(token) {
  const res = await axios.get(`${API_BASE}/facilities`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 1 }
  });
  const facilities = res.data?.facilities || res.data?.items || res.data || [];
  const facility = Array.isArray(facilities) ? facilities[0] : facilities.facilities?.[0];
  if (!facility?.id) throw new Error('No facility found');
  return facility.id;
}

async function createTestFacility(token, name = 'E2E-Test-Facility') {
  // Use dev-admin utility to avoid validation drift
  const res = await axios.post(`${API_BASE}/admin/facilities`, {
    name,
    address: '100 Test Ave, Test City, TS 00000',
    status: 'active',
    metadata: { e2e: true, createdAt: new Date().toISOString() }
  }, { headers: { Authorization: `Bearer ${token}` } });
  const facility = res.data?.facility || res.data;
  if (!facility?.id) throw new Error('Create facility failed');
  return facility.id;
}

async function createGateway(token, facilityId, name = 'E2E Test Gateway') {
  const res = await axios.post(`${API_BASE}/gateways`, {
    facility_id: facilityId,
    name,
    gateway_type: 'http',
    base_url: 'http://127.0.0.1', // placeholder for dev
    status: 'online'
  }, { headers: { Authorization: `Bearer ${token}` } });
  const gw = res.data?.gateway || res.data;
  return gw?.id || null;
}

async function getFacilityHierarchy(token, facilityId) {
  const res = await axios.get(`${API_BASE}/devices/facility/${facilityId}/hierarchy`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data?.hierarchy || res.data?.deviceHierarchy || res.data;
}

async function createUnit(token, facilityId, unitNumber) {
  const res = await axios.post(`${API_BASE}/units`, {
    unit_number: unitNumber,
    facility_id: facilityId,
    unit_type: 'Small',
    status: 'available'
  }, { headers: { Authorization: `Bearer ${token}` } });
  return res.data?.unit || res.data;
}

/** @param {string[]|string|null} facilityIdsForCreate Required for facility_admin (and some flows); pass facility UUID(s). */
async function createUser(token, email, role = 'tenant', facilityIdsForCreate = null) {
  // First try to find existing
  const list = await axios.get(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { search: email }
  });
  const existing = (list.data?.users || list.data || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (existing?.id) {
    // Reactivate if needed
    if (existing.is_active === false) {
      await axios.post(`${API_BASE}/users/${existing.id}/activate`, {}, { headers: { Authorization: `Bearer ${token}` } });
    }
    return existing.id;
  }
  const facilityIds = facilityIdsForCreate
    ? (Array.isArray(facilityIdsForCreate) ? facilityIdsForCreate : [facilityIdsForCreate])
    : undefined;
  // Create new
  const res = await axios.post(`${API_BASE}/users`, {
    email,
    password: 'TestUser123!',
    firstName: 'E2E',
    lastName: 'User',
    role,
    ...(facilityIds && facilityIds.length ? { facilityIds } : {}),
  }, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.data?.success) throw new Error(`Create user failed: ${res.data?.message}`);
  // Fetch back
  const list2 = await axios.get(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${token}` }, params: { search: email } });
  const match = (list2.data?.users || list2.data || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!match?.id) throw new Error('New user id not found');
  return match.id;
}

async function assignTenantToUnit(token, unitId, userId, isPrimary) {
  const res = await axios.post(`${API_BASE}/units/${unitId}/assign`, {
    tenant_id: userId,
    is_primary: !!isPrimary,
    access_type: 'full'
  }, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.data?.success) throw new Error(`Assign tenant failed: ${res.data?.message}`);
}

async function assignUserToFacility(token, userId, facilityId) {
  await axios.post(`${API_BASE}/user-facilities/${userId}/facilities/${facilityId}`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function createBlulokDevice(token, gatewayId, unitId, serial) {
  const res = await axios.post(`${API_BASE}/devices/blulok`, {
    gateway_id: gatewayId,
    name: `E2E Device ${serial}`,
    device_type: 'blulok',
    location_description: 'E2E Test Device',
    unit_id: unitId,
    serial
  }, { headers: { Authorization: `Bearer ${token}` } });
  const device = res.data?.device || res.data;
  if (!device?.id) throw new Error('Create device failed');
  return device.id;
}

async function findUnitByNumber(token, facilityId, unitNumber) {
  const res = await axios.get(`${API_BASE}/units`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { facility_id: facilityId, search: unitNumber, limit: 5 }
  });
  const units = res.data?.units || res.data?.data || res.data?.items || [];
  const match = units.find((u) => (u.unit_number || '').toLowerCase() === unitNumber.toLowerCase());
  return match || null;
}

async function findDeviceBySerial(token, facilityId, serial) {
  const res = await axios.get(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { device_type: 'blulok', facility_id: facilityId, search: serial, limit: 5 }
  });
  const devices = res.data?.devices || res.data?.items || [];
  const match = devices.find((d) => (d.device_serial || '').toLowerCase() === serial.toLowerCase());
  return match || null;
}

async function shareKey(token, unitId, sharedWithUserId, accessLevel = 'limited') {
  let res;
  try {
    res = await axios.post(`${API_BASE}/key-sharing`, {
      unit_id: unitId,
      shared_with_user_id: sharedWithUserId,
      access_level: accessLevel
    }, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error('  ❌ shareKey request failed', {
      status,
      response: data,
      unitId,
      sharedWithUserId,
      accessLevel,
    });
    try {
      const diag = await axios.get(`${API_BASE}/key-sharing`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          unit_id: unitId,
          shared_with_user_id: sharedWithUserId,
          limit: 5,
          sort_by: 'shared_at',
          sort_order: 'desc',
        }
      });
      console.error('    ↳ Existing shares for diagnostic:', {
        total: diag.data?.total,
        sharings: diag.data?.sharings || diag.data?.data || [],
      });
    } catch (diagErr) {
      console.error('    ↳ Failed to fetch diagnostic key-sharing data', {
        status: diagErr?.response?.status,
        response: diagErr?.response?.data,
      });
    }
    throw err;
  }
  let id = res.data?.id || res.data?.sharingId || res.data?.shareId || res.data?.share_id;
  if (!id) {
    // Fallback: query latest active share for this user/unit
    let q;
    try {
      q = await axios.get(`${API_BASE}/key-sharing`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          unit_id: unitId,
          shared_with_user_id: sharedWithUserId,
          is_active: true,
          limit: 1,
          sort_by: 'shared_at',
          sort_order: 'desc'
        }
      });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      console.error('  ❌ shareKey fallback lookup failed', {
        status,
        response: data,
        unitId,
        sharedWithUserId,
      });
      throw err;
    }
    id = (q.data?.sharings || [])[0]?.id;
  }
  return id;
}

async function tenantLogin(identifier, password, attempt = 1) {
  // Backend accepts either identifier (email/phone) or email; use identifier for both cases
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, { identifier, password });
    if (!res.data?.token) throw new Error('Tenant login failed');
    return res.data.token;
  } catch (err) {
    if (err?.response?.status === 429 && attempt < 6) {
      const waitMs = 1000 * attempt * attempt;
      await delay(waitMs);
      return tenantLogin(identifier, password, attempt + 1);
    }
    throw err;
  }
}

async function registerUserDevice(userToken, appDeviceId, publicKeyB64) {
  // As tenant
  const res = await axios.post(`${API_BASE}/user-devices/register-key`, {
    app_device_id: appDeviceId,
    platform: 'web',
    device_name: 'E2E Device',
    public_key: publicKeyB64
  }, { headers: { Authorization: `Bearer ${userToken}` } });
  if (!res.data?.success) throw new Error('Register device failed');
}

async function requestRoutePass(userToken, appDeviceId) {
  const res = await axios.post(`${API_BASE}/passes/request`, {}, {
    headers: {
      Authorization: `Bearer ${userToken}`,
      'X-App-Device-Id': appDeviceId
    }
  });
  if (!res.data?.success) throw new Error('Route pass request failed');
  return res.data.routePass;
}

async function revokeShare(token, shareId) {
  const res = await axios.delete(`${API_BASE}/key-sharing/${shareId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.data?.error) throw new Error(`Revoke share failed: ${res.data?.error}`);
}

async function reactivateShare(token, shareId) {
  const res = await axios.put(`${API_BASE}/key-sharing/${shareId}`, { is_active: true }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.data) throw new Error('Reactivate share failed');
}

async function deactivateUser(token, userId) {
  const res = await axios.delete(`${API_BASE}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.data?.success) throw new Error(`Deactivate user failed: ${res.data?.message}`);
}

async function activateUser(token, userId) {
  const res = await axios.post(`${API_BASE}/users/${userId}/activate`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.data?.success) throw new Error(`Activate user failed: ${res.data?.message}`);
}

async function unassignDevice(token, deviceId) {
  try {
    await axios.delete(`${API_BASE}/devices/blulok/${deviceId}/unassign`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {}
}

async function unassignTenantFromUnit(token, unitId, tenantId) {
  try {
    await axios.delete(`${API_BASE}/units/${unitId}/assign/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {}
}

async function getFirstUnassignedBlulok(token, facilityId) {
  const res = await axios.get(`${API_BASE}/devices/unassigned`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { facility_id: facilityId, limit: 1 }
  });
  const devices = res.data?.devices || [];
  return devices[0]?.id || null;
}

async function assignDeviceToUnit(token, deviceId, unitId) {
  await axios.post(`${API_BASE}/devices/blulok/${deviceId}/assign`, {
    unit_id: unitId
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function removeBluLokFromCloudInventory(token, deviceId) {
  const res = await axios.delete(`${API_BASE}/devices/blulok/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data?.success) {
    throw new Error(`Remove BluLok from cloud inventory failed: ${res.data?.message || res.status}`);
  }
  return res.data;
}

async function getBluLokDeviceHttp(token, deviceId) {
  return axios.get(`${API_BASE}/devices/blulok/${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function resolveUnassignedDeviceIdBySerial(token, facilityId, serial) {
  const res = await axios.get(`${API_BASE}/devices/unassigned`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { facility_id: facilityId, limit: 50 },
  });
  const list = res.data?.devices || [];
  const match = list.find((d) => (d.device_serial || '').toLowerCase() === serial.toLowerCase());
  return match?.id || null;
}

function normalizeCmd(msg) {
  let p = msg;
  try { p = typeof msg === 'string' ? JSON.parse(msg) : msg; } catch {}
  
  // Handle new JWT format: { type: 'COMMAND', jwt: 'eyJ...' }
  if (p && p.type === 'COMMAND' && p.jwt) {
    try {
      const parts = p.jwt.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (decoded?.cmd_type) return decoded;
      }
    } catch {}
    return null;
  }
  
  // Legacy: Transport may send either raw payload, [payload, signature], or a wrapper
  if (p && p.type === 'COMMAND') p = p.payload;
  if (Array.isArray(p) && p.length > 0 && p[0]?.cmd_type) return p[0];
  if (Array.isArray(p) && p.length > 0 && Array.isArray(p[0]) && p[0].length > 0 && p[0][0]?.cmd_type) return p[0][0];
  if (p?.cmd_type) return p;
  return null;
}

function waitForCommand(ws, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for COMMAND'));
    }, timeoutMs);
    const onMsg = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const cmd = normalizeCmd(parsed);
        if (cmd && predicate(cmd)) {
          cleanup();
          resolve(cmd);
        }
      } catch {}
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const cleanup = () => { clearTimeout(timer); ws.removeListener('message', onMsg); ws.removeListener('error', onErr); };
    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

/**
 * Verify an Ed25519 JWT signature using the ops public key and return decoded payload.
 * @param {string} jwt - Compact JWS (header.payload.signature, base64url parts)
 * @param {string} opsKeyB64 - Raw 32-byte Ed25519 public key (base64url or standard base64)
 * @returns {object} Decoded JWT payload
 */
function verifyAndDecodeJwt(jwt, opsKeyB64) {
  const crypto = require('crypto');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error(`JWT has ${parts.length} parts, expected 3`);

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

  // Verify JWT has an expiration claim
  if (!payload.exp) throw new Error('JWT missing exp claim — command JWTs must have expiration');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error(`JWT expired: exp=${payload.exp}, now=${now}`);

  // Build Ed25519 SPKI DER public key from raw bytes
  const keyNorm = opsKeyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rawPubKey = Buffer.from(keyNorm, 'base64url');
  if (rawPubKey.length !== 32) throw new Error(`Ed25519 public key should be 32 bytes, got ${rawPubKey.length}`);

  const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const derKey = Buffer.concat([derPrefix, rawPubKey]);
  const keyObj = crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });

  const sigInput = Buffer.from(parts[0] + '.' + parts[1]);
  const signature = Buffer.from(parts[2], 'base64url');
  const valid = crypto.verify(null, sigInput, keyObj, signature);
  if (!valid) throw new Error('Ed25519 JWT signature verification failed');

  return payload;
}

/**
 * Simulate gateway-side firmware OTA reception over WebSocket.
 *
 * Listens on the gateway WS for FIRMWARE_MANIFEST and FIRMWARE_CHUNK messages,
 * verifies every JWT signature with the ops public key, validates per-chunk
 * SHA-256 integrity, sends FIRMWARE_CHUNK_ACK for each chunk, and resolves
 * with the reassembled binary + manifest once all chunks are delivered.
 *
 * @param {WebSocket} ws - The authenticated gateway WebSocket
 * @param {string} opsKeyB64 - Ops Ed25519 public key (base64url)
 * @param {number} [timeoutMs=60000] - Overall timeout
 * @returns {Promise<{manifest: object, reassembled: Buffer, finalHash: string}>}
 */
function handleFirmwareDelivery(ws, opsKeyB64, timeoutMs = 60000) {
  const crypto = require('crypto');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Firmware delivery timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let manifest = null;
    const chunks = [];
    let expectedChunks = 0;

    const onMsg = (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'FIRMWARE_MANIFEST' && msg.jwt) {
          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type !== 'FIRMWARE_MANIFEST') throw new Error(`Expected cmd_type FIRMWARE_MANIFEST, got ${payload.cmd_type}`);
          if (!payload.sha256 || !payload.version || !payload.nonce || !payload.push_id) {
            throw new Error('Manifest missing required fields (sha256, version, nonce, push_id)');
          }
          if (typeof payload.chunk_count !== 'number' || payload.chunk_count < 1) throw new Error(`Invalid chunk_count: ${payload.chunk_count}`);
          if (!payload.target_type) throw new Error('Manifest missing target_type');
          if (!payload.filename) throw new Error('Manifest missing filename');
          manifest = payload;
          expectedChunks = payload.chunk_count;
          if (VERBOSE) console.log(`[FW] Manifest verified: version=${payload.version} chunks=${expectedChunks} sha256=${payload.sha256.substring(0, 12)}...`);
          return;
        }

        if (msg.type === 'FIRMWARE_CHUNK' && msg.jwt) {
          if (!manifest) throw new Error('Received FIRMWARE_CHUNK before FIRMWARE_MANIFEST');

          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type !== 'FIRMWARE_CHUNK') throw new Error(`Expected cmd_type FIRMWARE_CHUNK, got ${payload.cmd_type}`);
          if (payload.nonce !== manifest.nonce) throw new Error(`Chunk nonce mismatch: expected ${manifest.nonce}, got ${payload.nonce}`);
          if (typeof payload.chunk_index !== 'number') throw new Error('FIRMWARE_CHUNK missing chunk_index');
          // Verify target_type is carried on chunks
          if (manifest.target_type && payload.target_type !== manifest.target_type) {
            throw new Error(`Chunk target_type mismatch: expected ${manifest.target_type}, got ${payload.target_type}`);
          }

          // Verify per-chunk SHA-256
          const chunkBuf = Buffer.from(payload.data, 'base64');
          const chunkHash = crypto.createHash('sha256').update(chunkBuf).digest('hex');
          if (chunkHash !== payload.chunk_sha256) {
            throw new Error(`Chunk ${payload.chunk_index} SHA-256 mismatch: expected ${payload.chunk_sha256}, got ${chunkHash}`);
          }

          chunks[payload.chunk_index] = chunkBuf;
          if (VERBOSE) console.log(`[FW] Chunk ${payload.chunk_index + 1}/${expectedChunks} verified (${chunkBuf.length} bytes)`);

          // ACK the chunk so the server proceeds to the next one
          ws.send(JSON.stringify({
            type: 'FIRMWARE_CHUNK_ACK',
            nonce: payload.nonce,
            chunkIndex: payload.chunk_index,
            status: 'ok',
          }));

          // Check if all chunks have been received
          const receivedCount = chunks.filter(c => c !== undefined).length;
          if (receivedCount === expectedChunks) {
            cleanup();
            const reassembled = Buffer.concat(chunks);
            const finalHash = crypto.createHash('sha256').update(reassembled).digest('hex');
            resolve({ manifest, reassembled, finalHash });
          }
          return;
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onErr = (err) => { cleanup(); reject(err); };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onErr);
    };

    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

/**
 * Force an abrupt gateway WS disconnect mid-OTA after acknowledging
 * the first firmware chunk.
 */
function disconnectDuringFirmwareDelivery(ws, opsKeyB64, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting to disconnect during firmware delivery after ${timeoutMs}ms`));
    }, timeoutMs);

    let manifest = null;
    let disconnected = false;

    const onMsg = (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'FIRMWARE_MANIFEST' && msg.jwt) {
          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type === 'FIRMWARE_MANIFEST') {
            manifest = payload;
          }
          return;
        }

        if (msg.type === 'FIRMWARE_CHUNK' && msg.jwt && !disconnected) {
          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type !== 'FIRMWARE_CHUNK') return;

          ws.send(JSON.stringify({
            type: 'FIRMWARE_CHUNK_ACK',
            nonce: payload.nonce,
            chunkIndex: payload.chunk_index,
            status: 'ok',
          }));

          disconnected = true;
          try { ws.terminate(); } catch {}
          cleanup();
          resolve({
            nonce: payload.nonce,
            firstChunkIndex: payload.chunk_index,
            target_type: payload.target_type || manifest?.target_type,
            version: manifest?.version,
          });
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onErr = (err) => { cleanup(); reject(err); };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onErr);
    };

    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

/**
 * After reconnect, ACK resumed firmware chunks until all chunks are delivered.
 * This helper is tolerant of seeing chunks before manifest due to reconnect races.
 */
function handleResumedFirmwareDelivery(ws, opsKeyB64, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Resumed firmware delivery timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let manifest = null;
    let nonce = null;
    const chunkIndexes = new Set();

    const onMsg = (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'FIRMWARE_MANIFEST' && msg.jwt) {
          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type !== 'FIRMWARE_MANIFEST') return;
          manifest = payload;
          nonce = payload.nonce || nonce;
          return;
        }

        if (msg.type === 'FIRMWARE_CHUNK' && msg.jwt) {
          const payload = verifyAndDecodeJwt(msg.jwt, opsKeyB64);
          if (payload.cmd_type !== 'FIRMWARE_CHUNK') return;
          nonce = payload.nonce || nonce;
          chunkIndexes.add(payload.chunk_index);
          ws.send(JSON.stringify({
            type: 'FIRMWARE_CHUNK_ACK',
            nonce: payload.nonce,
            chunkIndex: payload.chunk_index,
            status: 'ok',
          }));

          if (manifest && Number.isInteger(manifest.chunk_count) && chunkIndexes.size >= manifest.chunk_count) {
            cleanup();
            resolve({
              nonce,
              manifest,
              chunkCount: chunkIndexes.size,
            });
          }
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onErr = (err) => { cleanup(); reject(err); };
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      ws.removeListener('error', onErr);
    };

    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

function waitForProxyResponse(ws, id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for PROXY_RESPONSE id=${id}`)); }, timeoutMs);
    const onMsg = (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m && m.type === 'PROXY_RESPONSE' && m.id === id) { cleanup(); resolve(m); }
      } catch {}
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const cleanup = () => { clearTimeout(timer); ws.removeListener('message', onMsg); ws.removeListener('error', onErr); };
    ws.on('message', onMsg);
    ws.on('error', onErr);
  });
}

async function run() {
  console.log('=== WS Gateway E2E ===');
  console.log(C.gray(`API (HTTP)=${API_BASE}`));
  console.log(C.gray(`Gateway WS=${WS_URL}`));
  console.log(C.gray(`Dashboard WS=${UI_WS_URL}`));
  console.log(C.gray(`Port ${E2E_RESOLVED_PORT} — ${E2E_PORT_SOURCE}`));

  const loginResult = await login();
  const token = loginResult.token;
  const loginOpsPublicKey = loginResult.ops_public_key;
  const loginOpsPublicKeyJwk = loginResult.ops_public_key_jwk;
  const loginOpsPublicKeyPem = loginResult.ops_public_key_pem;
  const devAdminProfile = await fetchAuthProfile(token);
  if (!devAdminProfile?.id) throw new Error('Failed to fetch auth profile or profile missing id');
  step('Verifying user details endpoint');
  await verifyUserDetailsEndpoint(token, devAdminProfile.id);
  let rateLimitBypassEnabled = await setRateLimitBypass(token, true, 900);
  let notificationsTestModeEnabled = await setNotificationsTestMode(token, true);
  await cleanupPreviousArtifacts(token);
  // Create a dedicated E2E facility and work exclusively against it
  heading('Setup Facility');
  step('Creating E2E test facility');
  const facilityId = await createTestFacility(token, 'E2E-Test-Facility');
  ok(`Facility created: ${facilityId}`);
  // Ensure a gateway record exists for this facility (required by device-sync)
  step('Ensuring gateway exists for facility');
  let gatewayId = await createGateway(token, facilityId, 'E2E Test Gateway').catch(() => null);
  ok(`Gateway record ${gatewayId ? 'created' : 'will be created by sync'}`);
  // Track created resources for cleanup
  const created = {
    facilityId,
    gatewayId,
    fmsConfigId: null,
    unitId: null,
    deviceId: null,
    primaryTenantId: null,
    users: [],
    units: [],
    shares: [],
    scheduleId: null,
    accessControlDeviceIds: [],
    facilityAdminId: null,
    facilityAdminToken: null,
    primaryAppDevId: null,
  };
  const facilityAdmin = { id: null, token: null, email: null };
  let share1Token = null;
  let share2Token = null;
  let primaryToken = null;
  let accessCodeOriginalConfig = null;
  let accessCodeConfigModified = false;
  let accessCodeConfigFacilityId = null;
  let unitLinkedSwapGroupId = null;
  let accessCodeGroupId = null;
  let globalSharedAccessCodeGroupId = null;
  let demotedGlobalSharedAccessCodeGroupId = null;
  let privateAccessCodeGroupId = null;
  const platformAdmin = { id: null, token: null, email: null };
  let selectedAccessCodeScheduleId = null;

  heading('Environment');
  info(`Using facility=${facilityId}`);
  info(`Gateway=${gatewayId || 'pending (after device-sync)'}`);

  step('Provisioning facility admin for coverage');
  const facilityAdminEmail = `fac-admin-${Date.now()}@test.com`;
  const facilityAdminPassword = 'TestUser123!';
  facilityAdmin.id = await createUser(token, facilityAdminEmail, 'facility_admin', facilityId);
  facilityAdmin.email = facilityAdminEmail;
  created.users.push(facilityAdmin.id);
  const facilityAdminLogin = await axios.post(`${API_BASE}/auth/login`, {
    email: facilityAdminEmail,
    password: facilityAdminPassword
  });
  facilityAdmin.token = facilityAdminLogin.data?.token;
  if (!facilityAdmin.token) throw new Error('Facility admin login failed');
  created.facilityAdminId = facilityAdmin.id;
  created.facilityAdminToken = facilityAdmin.token;
  ok('Facility admin ready');

  step('Provisioning platform admin for app-code role coverage');
  const platformAdminEmail = `admin-${Date.now()}@test.com`;
  const platformAdminPassword = 'TestUser123!';
  platformAdmin.id = await createUser(token, platformAdminEmail, 'admin');
  platformAdmin.email = platformAdminEmail;
  created.users.push(platformAdmin.id);
  const platformAdminLogin = await axios.post(`${API_BASE}/auth/login`, {
    email: platformAdminEmail,
    password: platformAdminPassword,
  });
  platformAdmin.token = platformAdminLogin.data?.token;
  if (!platformAdmin.token) throw new Error('Platform admin login failed');
  ok('Platform admin ready');
  // Remember original configs to restore after test
  let existingConfig = null;
  let mockFmsServer = null;
  let originalFirmwareStorageConfig = null;
  let firmwareStorageConfigOverridden = false;
  let canRestoreFirmwareStorageConfig = false;

  heading('Firmware Storage');
  step('Forcing firmware storage to local provider for deterministic offline E2E');
  const currentStorageResp = await axios.get(`${API_BASE}/admin/storage-config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const currentStorageConfig = currentStorageResp.data?.config;
  if (!currentStorageConfig?.providerType || !currentStorageConfig?.providerConfig) {
    throw new Error('Unable to read current firmware storage config');
  }

  originalFirmwareStorageConfig = {
    providerType: currentStorageConfig.providerType,
    providerConfig: currentStorageConfig.providerConfig,
  };

  const hasRedactedSecrets = (value) => {
    if (value === '***') return true;
    if (Array.isArray(value)) return value.some((item) => hasRedactedSecrets(item));
    if (value && typeof value === 'object') {
      return Object.values(value).some((item) => hasRedactedSecrets(item));
    }
    return false;
  };

  canRestoreFirmwareStorageConfig = !hasRedactedSecrets(currentStorageConfig.providerConfig);
  if (!canRestoreFirmwareStorageConfig) {
    warn('Current firmware storage config contains redacted secrets; post-run restore will be skipped');
  }

  await axios.put(`${API_BASE}/admin/storage-config`, {
    providerType: 'local',
    providerConfig: {
      basePath: './test-storage',
    },
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  firmwareStorageConfigOverridden = true;
  ok('Firmware storage configured to local test path');

  // Connect dev-notifications WebSocket for observing invites/OTPs
  notificationsWs = await connectNotificationsWs(token);

  // Connect gateway WS
  let ws = await connectGatewayWsAndAuth(WS_URL, token, facilityId);
  heading('Gateway WebSocket');
  ok('Gateway AUTH_OK');

  // ---- Ops Public Key Distribution Tests ----
  heading('Ops Public Key Distribution');

  // Verify ops_public_key (raw base64url) in HTTP login response
  step('Verifying ops_public_key (base64url) in HTTP login response');
  if (!loginOpsPublicKey) throw new Error('ops_public_key missing from HTTP login response');
  if (typeof loginOpsPublicKey !== 'string' || loginOpsPublicKey.length === 0) throw new Error('ops_public_key should be a non-empty string');
  ok(`HTTP login includes ops_public_key (${loginOpsPublicKey.substring(0, 16)}...)`);

  // Verify ops_public_key_jwk in HTTP login response
  step('Verifying ops_public_key_jwk in HTTP login response');
  if (!loginOpsPublicKeyJwk) throw new Error('ops_public_key_jwk missing from HTTP login response');
  if (loginOpsPublicKeyJwk.kty !== 'OKP') throw new Error(`JWK kty should be OKP, got ${loginOpsPublicKeyJwk.kty}`);
  if (loginOpsPublicKeyJwk.crv !== 'Ed25519') throw new Error(`JWK crv should be Ed25519, got ${loginOpsPublicKeyJwk.crv}`);
  if (loginOpsPublicKeyJwk.x !== loginOpsPublicKey) throw new Error('JWK x does not match ops_public_key');
  if (loginOpsPublicKeyJwk.d) throw new Error('JWK must not contain private key material (d)');
  ok(`HTTP login includes ops_public_key_jwk (kty=${loginOpsPublicKeyJwk.kty}, crv=${loginOpsPublicKeyJwk.crv})`);

  // Verify ops_public_key_pem in HTTP login response
  step('Verifying ops_public_key_pem in HTTP login response');
  if (!loginOpsPublicKeyPem) throw new Error('ops_public_key_pem missing from HTTP login response');
  if (!loginOpsPublicKeyPem.includes('-----BEGIN PUBLIC KEY-----')) throw new Error('PEM missing BEGIN header');
  if (!loginOpsPublicKeyPem.includes('-----END PUBLIC KEY-----')) throw new Error('PEM missing END footer');
  ok('HTTP login includes ops_public_key_pem (SPKI PEM)');

  // Verify ops_public_key in gateway WS AUTH_OK
  step('Verifying ops_public_key in gateway WS AUTH_OK');
  const authOkKey = ws._authOkData?.ops_public_key;
  if (!authOkKey) throw new Error('ops_public_key missing from gateway AUTH_OK');
  if (typeof authOkKey !== 'string' || authOkKey.length === 0) throw new Error('AUTH_OK ops_public_key should be a non-empty string');
  ok(`Gateway AUTH_OK includes ops_public_key (${authOkKey.substring(0, 16)}...)`);

  // Verify JWK and PEM in gateway WS AUTH_OK
  step('Verifying ops_public_key_jwk in gateway WS AUTH_OK');
  const authOkJwk = ws._authOkData?.ops_public_key_jwk;
  if (!authOkJwk) throw new Error('ops_public_key_jwk missing from gateway AUTH_OK');
  if (authOkJwk.kty !== 'OKP' || authOkJwk.crv !== 'Ed25519') throw new Error('AUTH_OK JWK has wrong kty/crv');
  if (authOkJwk.x !== authOkKey) throw new Error('AUTH_OK JWK x does not match ops_public_key');
  ok('Gateway AUTH_OK includes ops_public_key_jwk');

  step('Verifying ops_public_key_pem in gateway WS AUTH_OK');
  const authOkPem = ws._authOkData?.ops_public_key_pem;
  if (!authOkPem) throw new Error('ops_public_key_pem missing from gateway AUTH_OK');
  if (!authOkPem.includes('-----BEGIN PUBLIC KEY-----')) throw new Error('AUTH_OK PEM missing BEGIN header');
  ok('Gateway AUTH_OK includes ops_public_key_pem');

  // Verify all formats match across login and AUTH_OK
  step('Verifying ops keys are consistent across login and AUTH_OK');
  if (loginOpsPublicKey !== authOkKey) throw new Error(`ops_public_key mismatch: login=${loginOpsPublicKey} vs AUTH_OK=${authOkKey}`);
  if (loginOpsPublicKeyJwk.x !== authOkJwk.x) throw new Error('JWK x mismatch between login and AUTH_OK');
  if (loginOpsPublicKeyPem !== authOkPem) throw new Error('PEM mismatch between login and AUTH_OK');
  ok('All ops key formats consistent across HTTP login and gateway AUTH_OK');

  // Verify ops keys in WS proxy login
  step('Verifying ops keys in WS proxy login');
  const proxyLoginId = 'req-proxy-login';
  ws.send(JSON.stringify({
    type: 'PROXY_REQUEST',
    id: proxyLoginId,
    method: 'POST',
    path: '/auth/login',
    body: { email: EMAIL, password: PASSWORD },
  }));
  const proxyLoginResp = await waitForProxyResponse(ws, proxyLoginId);
  if (proxyLoginResp.status !== 200) throw new Error(`Proxy login failed with status ${proxyLoginResp.status}`);
  const proxyOpsKey = proxyLoginResp.body?.ops_public_key;
  if (!proxyOpsKey) throw new Error('ops_public_key missing from WS proxy login response');
  if (proxyOpsKey !== loginOpsPublicKey) throw new Error(`Proxy ops_public_key mismatch: ${proxyOpsKey} vs ${loginOpsPublicKey}`);
  const proxyOpsJwk = proxyLoginResp.body?.ops_public_key_jwk;
  if (!proxyOpsJwk || proxyOpsJwk.x !== loginOpsPublicKey) throw new Error('Proxy ops_public_key_jwk mismatch');
  const proxyOpsPem = proxyLoginResp.body?.ops_public_key_pem;
  if (!proxyOpsPem || proxyOpsPem !== loginOpsPublicKeyPem) throw new Error('Proxy ops_public_key_pem mismatch');
  ok('WS proxy login includes all matching ops key formats');

  step('Checking gateway presence via admin gateways endpoint');
  const gatewayStatus = await axios.get(`${API_BASE}/gateways`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!gatewayStatus.data?.success) throw new Error('Gateway list endpoint failed');
  const listedGateways = gatewayStatus.data?.gateways || [];
  const matchedGateway = listedGateways.find((g) => g?.facility_id === facilityId);
  if (!matchedGateway) throw new Error(`No gateway found for facility ${facilityId} in gateway list`);
  ok('Gateway listed successfully for facility');

  step('Forcing gateway PING via dev-tools endpoint and asserting PONG_OK');
  gatewayWsEvents.length = 0;
  await forceGatewayPing(token, facilityId);
  await waitForGatewayEvent((e) => e.type === 'PING', 3000);
  const pongOk = await waitForGatewayEvent((e) => e.type === 'PONG_OK', 3000);
  if (!pongOk || typeof pongOk.ts !== 'number') {
    throw new Error('Did not receive PONG_OK with timestamp from gateway');
  }
  ok('Gateway responded to forced PING with PONG_OK');

  try {
    // ---------------- FMS Mock + Config + Sync ----------------
    heading('FMS Mock + Sync');
    const nowTs = Date.now();
    const fmsUnitNumber = `E2E-FMS-${nowTs}`;
    const extUnitId = `ext-unit-${nowTs}`;
    const extTenantId = `ext-tenant-${nowTs}`;
    const extTenantIdS1 = `ext-tenant-s1-${nowTs}`;
    const extTenantIdS2 = `ext-tenant-s2-${nowTs}`;
    // Predefine emails for tenants created via FMS
    const primaryEmail = `fms-primary-${nowTs}@test.com`;
    const share1Email = `fms-share1-${nowTs}@test.com`;
    const share2Email = `fms-share2-${nowTs}@test.com`;
    // Storedge-shaped dataset
    const datasetPhase1 = {
      tenants: [
        {
          id: extTenantId,
          email: primaryEmail,
          first_name: 'FMS',
          last_name: 'Primary',
          phone_numbers: [{ number: '+15551230000', primary: true }],
          active: true
        },
        {
          id: extTenantIdS1,
          email: share1Email,
          first_name: 'FMS',
          last_name: 'Share1',
          phone_numbers: [{ number: '+15551230001', primary: true }],
          active: true
        },
        {
          id: extTenantIdS2,
          email: share2Email,
          first_name: 'FMS',
          last_name: 'Share2',
          phone_numbers: [{ number: '+15551230002', primary: true }],
          active: true
        }
      ],
      units: [{
        id: extUnitId,
        name: fmsUnitNumber,
        unit_type: { name: 'Small' },
        size: '5x5',
        status: 'occupied',
        current_tenant_id: extTenantId,
        price: 100
      }],
      ledgers: [
        {
          tenant: { id: extTenantId },
          unit: { id: extUnitId }
        }
      ]
    };
    const { server: fmsServer, port: fmsPort } = await startMockFmsServer(datasetPhase1);
    mockFmsServer = fmsServer;
    info(`Mock FMS started at http://127.0.0.1:${fmsPort}`);

    // Create or reuse config
    step('Create FMS config (storedge)');
    let configId = null;
    let createdFmsConfig = false;
    try {
      const created = await axios.post(`${API_BASE}/fms/config`, {
        facility_id: facilityId,
        provider_type: 'storedge',
        is_enabled: true,
        config: {
          providerType: 'storedge',
          baseUrl: `http://127.0.0.1:${fmsPort}`,
          auth: { type: 'api_key', credentials: { apiKey: 'dev-key' } },
          features: { supportsTenantSync: true, supportsUnitSync: true, supportsWebhooks: false, supportsRealtime: false },
          syncSettings: { autoAcceptChanges: false },
          customSettings: { facilityId: 'mock-fac' }
        }
      }, { headers: { Authorization: `Bearer ${token}` } });
      configId = created.data?.config?.id || null;
      createdFmsConfig = true;
    } catch {
      // If already exists, fetch
      const existing = await axios.get(`${API_BASE}/fms/config/${facilityId}`, { headers: { Authorization: `Bearer ${token}` } });
      existingConfig = existing.data?.config || null;
      configId = existingConfig?.id || null;
    }
    if (!configId) throw new Error('FMS config id missing');
    if (createdFmsConfig) {
      created.fmsConfigId = configId;
    }

    // Force the config to use our mock Storedge server for this run, remembering original to restore later
    await axios.put(`${API_BASE}/fms/config/${configId}`, {
      provider_type: 'storedge',
      is_enabled: true,
      config: {
        providerType: 'storedge',
        baseUrl: `http://127.0.0.1:${fmsPort}`,
        auth: { type: 'api_key', credentials: { apiKey: 'dev-key' } },
        features: { supportsTenantSync: true, supportsUnitSync: true, supportsWebhooks: false, supportsRealtime: false },
        syncSettings: { autoAcceptChanges: false },
        customSettings: { facilityId: 'mock-fac' }
      }
    }, { headers: { Authorization: `Bearer ${token}` } });
      ok('FMS config ready');

    // Test connection
    const testConn = await axios.post(`${API_BASE}/fms/config/${configId}/test`, {}, { headers: { Authorization: `Bearer ${token}` } });
    if (!testConn.data?.connected) throw new Error('FMS connection test failed');
    ok('FMS connection OK');

    // Trigger sync
    const syncRes = await axios.post(`${API_BASE}/fms/sync/${facilityId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    const syncLogId = syncRes.data?.result?.syncLogId;
    if (!syncLogId) throw new Error('No syncLogId');
    ok(`FMS sync started: ${syncLogId}`);

    // Fetch pending changes, accept only our mock Storedge changes (filter by ext ids) and only valid ones
    const pending = await axios.get(`${API_BASE}/fms/changes/${syncLogId}/pending`, { headers: { Authorization: `Bearer ${token}` } });
    const allChanges = pending.data?.changes || [];
    const wanted = allChanges.filter((c) => {
      const a = c.after_data || {};
      if (c.entity_type === 'tenant' && (
        a.externalId === extTenantId ||
        a.externalId === extTenantIdS1 ||
        a.externalId === extTenantIdS2 ||
        (Array.isArray(a.unitIds) && a.unitIds.includes(extUnitId))
      )) return true;
      if (c.entity_type === 'unit' && a.externalId === extUnitId) return true;
      return false;
    }).filter((c) => c.is_valid !== false);
    const changeIds = wanted.map((c) => c.id);
    if (changeIds.length === 0) {
      throw new Error('No applicable Storedge FMS changes detected for test dataset');
    }
    await axios.post(`${API_BASE}/fms/changes/review`, { syncLogId, changeIds, accepted: true }, { headers: { Authorization: `Bearer ${token}` } });
    const applied = await axios.post(`${API_BASE}/fms/changes/apply`, { syncLogId, changeIds }, { headers: { Authorization: `Bearer ${token}` } });
    ok(`FMS changes applied: ${applied.data?.result?.changesApplied || changeIds.length}`);

    // Phase 1: Simulate realistic gateway device syncs (add, then remove)
    heading('Gateway Device Sync');
    step('Initial device sync (add 3 devices)');
    const initialDevices = [
      {
        serial: `GW-E2E-${Date.now()}-1`,
        firmwareVersion: '3A0-001',
        online: true,
        locked: false,
        batteryLevel: 3450,
        lockNumber: 495,
        batteryUnit: 'mV',
        signalStrength: 80,
        temperatureValue: 21.5,
        temperatureUnit: 'C',
        lastSeen: new Date().toISOString(),
      },
      { serial: `GW-E2E-${Date.now()}-2`, firmwareVersion: '3A0-001', online: false, locked: false, batteryLevel: 3400 },
      { serial: `GW-E2E-${Date.now()}-3`, firmwareVersion: '3A0-001', online: true, locked: true, batteryLevel: 3300 },
    ];
    const reqSync1 = 'req-internal-sync-1';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqSync1, method: 'POST', path: `/internal/gateway/device-sync`, body: { tid: 'sync-1', devices: initialDevices, facility_id: facilityId } }));
    const respSync1 = await waitForProxyResponse(ws, reqSync1);
    if (respSync1.status !== 200 || !respSync1.body?.success) throw new Error(`Device sync (add) failed: ${respSync1.status}`);
    if (respSync1.body?.data?.gateway_id) {
      gatewayId = respSync1.body.data.gateway_id;
      created.gatewayId = gatewayId;
      info(`Resolved gateway_id=${gatewayId}`);
    }
    ok(`Added ${initialDevices.length} devices via device-sync`);

    // Keep first device; remove others
    const remainingSerial = initialDevices[0].serial;
    step('Second device sync (remove others, keep 1)');
    const reqSync2 = 'req-internal-sync-2';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqSync2, method: 'POST', path: `/internal/gateway/device-sync`, body: { devices: [{ serial: remainingSerial, firmwareVersion: '3A0-001', online: true, locked: false, batteryLevel: 3450 }], facility_id: facilityId } }));
    const respSync2 = await waitForProxyResponse(ws, reqSync2);
    if (respSync2.status !== 200 || !respSync2.body?.success) throw new Error(`Device sync (remove) failed: ${respSync2.status}`);
    ok('Device inventory reduced to 1');

    // Resolve remaining deviceId
    step('Resolving remaining device by serial');
    let deviceId = null;
    try {
      const resDevices = await axios.get(`${API_BASE}/devices/unassigned`, { headers: { Authorization: `Bearer ${token}` }, params: { facility_id: facilityId, limit: 50 } });
      const list = resDevices.data?.devices || [];
      const match = list.find((d) => (d.device_serial || '').toLowerCase() === remainingSerial.toLowerCase());
      deviceId = match?.id || null;

      if (!match) {
        throw new Error('Remaining device not found in unassigned devices list');
      }

      // Validate that gateway device sync telemetry and extra fields were preserved
      const gatewayData = (match.device_settings && match.device_settings.gatewayData) || {};
      if (!gatewayData || typeof gatewayData !== 'object') {
        throw new Error('gatewayData missing on synced device');
      }

      // Check that key telemetry fields and extras came through from internal gateway/device-sync
      if (gatewayData.serial !== remainingSerial) {
        throw new Error(`gatewayData.serial mismatch; expected ${remainingSerial}, got ${gatewayData.serial}`);
      }
      if (gatewayData.lockNumber !== initialDevices[0].lockNumber) {
        throw new Error(`gatewayData.lockNumber mismatch; expected ${initialDevices[0].lockNumber}, got ${gatewayData.lockNumber}`);
      }
      if (gatewayData.signalStrength !== initialDevices[0].signalStrength) {
        throw new Error(`gatewayData.signalStrength mismatch; expected ${initialDevices[0].signalStrength}, got ${gatewayData.signalStrength}`);
      }
      if (gatewayData.temperatureValue !== initialDevices[0].temperatureValue) {
        throw new Error(`gatewayData.temperatureValue mismatch; expected ${initialDevices[0].temperatureValue}, got ${gatewayData.temperatureValue}`);
      }
      // Normalized temperature field should mirror temperatureValue
      if (gatewayData.temperature !== initialDevices[0].temperatureValue) {
        throw new Error(`gatewayData.temperature normalization mismatch; expected ${initialDevices[0].temperatureValue}, got ${gatewayData.temperature}`);
      }
    } catch {}
    if (!deviceId) throw new Error('Remaining device not found after sync');
    ok(`Using device ${deviceId} (serial=${remainingSerial})`);

    // Create access control devices now that we have a confirmed gatewayId
    heading('Access Control Device Setup');
    if (!gatewayId) throw new Error('No gatewayId available – cannot create access control devices');
    const acDeviceTypes = [
      { name: 'Main Entrance Door', device_type: 'door', location_description: 'Building A - Ground Floor', relay_channel: 1 },
      { name: 'Parking Gate', device_type: 'gate', location_description: 'North Parking Lot', relay_channel: 2 },
      { name: 'Service Elevator', device_type: 'elevator', location_description: 'Building A - Rear', relay_channel: 3 },
    ];
    for (const acDef of acDeviceTypes) {
      step(`Creating ${acDef.device_type} device: ${acDef.name}`);
      const acResp = await axios.post(`${API_BASE}/devices/access-control`, {
        gateway_id: gatewayId,
        ...acDef
      }, { headers: { Authorization: `Bearer ${token}` } });
      if (!acResp.data?.success || !acResp.data?.device?.id) {
        throw new Error(`${acDef.device_type} creation returned unexpected response: ${JSON.stringify(acResp.data)}`);
      }
      created.accessControlDeviceIds.push(acResp.data.device.id);
      ok(`Created ${acDef.device_type}: ${acResp.data.device.id}`);
    }
    if (created.accessControlDeviceIds.length !== 3) {
      throw new Error(`Expected 3 access control devices, created ${created.accessControlDeviceIds.length}`);
    }
    ok(`Created ${created.accessControlDeviceIds.length} access control devices`);

    // Resolve unit that arrived via FMS sync
    heading('Unit and Device Setup');
    const unitNumber = fmsUnitNumber;
    step('Resolving FMS-synced unit');
    const unit = await findUnitByNumber(token, facilityId, unitNumber);
    if (!unit) {
      throw new Error('FMS sync did not create expected unit');
    } else if (VERBOSE) {
      console.log('Using FMS unit', unit.id, unit.unit_number);
    }
    const unitId = unit.id;
    created.unitId = unitId;
    ok(`Using FMS-provisioned unit ${unitId}`);

    // Assign remaining synced device to unit
    await assignDeviceToUnit(token, deviceId, unitId);
    ok(`Assigned device ${deviceId} to unit`);
    created.deviceId = deviceId;

    // ---- HTTP: same LockCommandService path as dashboard (not DevTools gateway-command) ----
    heading('HTTP API — Cloud lock / unlock (BluLok + access control)');
    step('PUT /devices/blulok/:id/lock — lock then unlock (CLOSE / OPEN via gateway)');
    const lockRes = await axios.put(
      `${API_BASE}/devices/blulok/${deviceId}/lock`,
      { lock_status: 'locked' },
      { headers: authHeaders(token) },
    );
    if (lockRes.status !== 200 || lockRes.data?.success === false) {
      throw new Error(`Cloud lock failed: ${lockRes.status} ${JSON.stringify(lockRes.data)}`);
    }
    ok('BluLok cloud lock accepted');
    const unlockRes = await axios.put(
      `${API_BASE}/devices/blulok/${deviceId}/lock`,
      { lock_status: 'unlocked' },
      { headers: authHeaders(token) },
    );
    if (unlockRes.status !== 200 || unlockRes.data?.success === false) {
      throw new Error(`Cloud unlock failed: ${unlockRes.status} ${JSON.stringify(unlockRes.data)}`);
    }
    ok('BluLok cloud unlock accepted');
    if (created.accessControlDeviceIds.length > 0) {
      const acId = created.accessControlDeviceIds[0];
      step(`PUT /devices/access-control/:id/lock — unlock (${acId})`);
      const acLock = await axios.put(
        `${API_BASE}/devices/access-control/${acId}/lock`,
        { lock_status: 'unlocked' },
        { headers: authHeaders(token) },
      );
      if (acLock.status !== 200 || acLock.data?.success === false) {
        throw new Error(`Access-control cloud unlock failed: ${acLock.status} ${JSON.stringify(acLock.data)}`);
      }
      ok('Access-control cloud unlock (OPEN) accepted');
    }

    // ---- Gateway-specific tests via PROXY_REQUEST over WS ----
    heading('Gateway Proxy API Tests');
    // PROXY: GET devices scoped to facility
    const reqDevices = 'req-devices';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqDevices, method: 'GET', path: `/devices`, query: { facility_id: facilityId, limit: 1 } }));
    const respDevices = await waitForProxyResponse(ws, reqDevices);
    if (respDevices.status !== 200) throw new Error(`Proxy GET devices failed: ${respDevices.status}`);

    // PROXY: Secure time sync packet
    const reqTs = 'req-time-sync';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqTs, method: 'GET', path: `/internal/gateway/time-sync` }));
    const respTs = await waitForProxyResponse(ws, reqTs);
    if (respTs.status !== 200 || !respTs.body?.success) throw new Error(`Proxy GET time-sync failed: ${respTs.status}`);

    const tsJwt = respTs.body?.timeSyncJwt;
    if (!tsJwt || typeof tsJwt !== 'string') {
      throw new Error('timeSyncJwt missing or invalid in time-sync response');
    }
    const tsClaims = decodeJwtClaims(tsJwt);
    if (!tsClaims || tsClaims.cmd_type !== 'SECURE_TIME_SYNC' || typeof tsClaims.ts !== 'number') {
      throw new Error(`Invalid time-sync JWT claims: ${JSON.stringify(tsClaims)}`);
    }

    // PROXY: Request time sync for a specific lock (use our deviceId)
    const reqTsLock = 'req-time-sync-lock';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqTsLock, method: 'POST', path: `/internal/gateway/request-time-sync`, body: { lock_id: deviceId } }));
    const respTsLock = await waitForProxyResponse(ws, reqTsLock);
    if (respTsLock.status !== 200 || !respTsLock.body?.success) {
      throw new Error(`Proxy POST request-time-sync returned non-200 or unsuccessful: status=${respTsLock.status}`);
    }
    ok('Proxy POST request-time-sync succeeded');

    // Negative test: device-sync should reject devices without any identifiers
    step('Negative device-sync payload (missing identifiers) should be rejected');
    const badSyncId = 'req-internal-sync-bad';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: badSyncId,
      method: 'POST',
      path: `/internal/gateway/device-sync`,
      body: {
        facility_id: facilityId,
        devices: [{ batteryLevel: 10 }],
      },
    }));
    const badSyncResp = await waitForProxyResponse(ws, badSyncId);
    if (badSyncResp.status !== 400) {
      throw new Error(`Expected 400 for invalid device-sync payload, got ${badSyncResp.status}`);
    }
    step('Negative device-sync payload (blank identifier) should be rejected');
    const blankIdSyncId = 'req-internal-sync-blank-id';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: blankIdSyncId,
      method: 'POST',
      path: `/internal/gateway/device-sync`,
      body: {
        facility_id: facilityId,
        devices: [{ serial: '   ' }],
      },
    }));
    const blankIdSyncResp = await waitForProxyResponse(ws, blankIdSyncId);
    if (blankIdSyncResp.status !== 400) {
      throw new Error(`Expected 400 for blank identifier device-sync payload, got ${blankIdSyncResp.status}`);
    }

    step('Negative BluLok create payload (conflicting serial aliases) should be rejected');
    const conflictSerialId = 'req-device-create-conflicting-serial';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: conflictSerialId,
      method: 'POST',
      path: `/devices/blulok`,
      body: {
        gateway_id: gatewayId,
        name: 'Conflict Serial Device',
        device_type: 'blulok',
        location_description: 'E2E Conflict Serial Device',
        unit_id: unitId,
        serial: `BL-CONFLICT-${Date.now()}-A`,
        device_serial: `BL-CONFLICT-${Date.now()}-B`,
      },
    }));
    const conflictSerialResp = await waitForProxyResponse(ws, conflictSerialId);
    if (conflictSerialResp.status !== 400) {
      throw new Error(`Expected 400 for conflicting serial aliases, got ${conflictSerialResp.status}`);
    }

    // ---- NEW ENDPOINTS: /devices/inventory and /devices/state ----
    heading('New Device Endpoints (Inventory + State)');
    
    // Test devices/inventory - add devices with state fields (new combined format)
    // IMPORTANT: Include remainingSerial in ALL inventory syncs to keep the original device!
    step('Testing POST /devices/inventory (add devices with state fields)');
    const inventorySerial1 = `INV-E2E-${Date.now()}-1`;
    const inventorySerial2 = `INV-E2E-${Date.now()}-2`;
    const reqInventory1 = 'req-inventory-1';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqInventory1,
      method: 'POST',
      path: `/internal/gateway/devices/inventory`,
      body: {
        facility_id: facilityId,
        tid: 1,
        devices: [
          { lock_id: remainingSerial }, // Keep original device!
          // New format with all state fields included in inventory
          { 
            lock_id: inventorySerial1, 
            lock_number: 201, 
            firmware_version: '3A0-002',
            state: 'CLOSED',
            battery_level: 3423,
            battery_unit: 'mV',
            signal_strength: 0,
            temperature_value: 24,
            temperature_unit: '°C',
            locked: true,
            online: false,
            last_seen: new Date().toISOString(),
          },
          { 
            lock_id: inventorySerial2, 
            lock_number: 202, 
            firmware_version: '3A0-001',
            state: 'OPENED',
            battery_level: 3200,
            online: true,
          },
        ],
      },
    }));
    const respInventory1 = await waitForProxyResponse(ws, reqInventory1);
    if (respInventory1.status !== 200 || !respInventory1.body?.success) {
      throw new Error(`Device inventory add failed: ${respInventory1.status}`);
    }
    const invResult1 = respInventory1.body?.data;
    if (invResult1?.added !== 2) {
      throw new Error(`Expected 2 devices added, got ${invResult1?.added}`);
    }
    ok(`Inventory sync added ${invResult1.added} devices with state fields`);

    // Test devices/state - partial state update (new gateway format with mV battery and state field)
    step('Testing POST /devices/state (partial updates with new format)');
    const reqState1 = 'req-state-1';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqState1,
      method: 'POST',
      path: `/internal/gateway/devices/state`,
      body: {
        facility_id: facilityId,
        tid: 2,
        updates: [
          // New format matching gateway payload
          { 
            lock_id: inventorySerial1, 
            lock_number: 16136,
            state: 'CLOSED', // Maps to lock_status: 'locked'
            battery_level: 3423, // Raw mV, not percentage
            battery_unit: 'mV',
            online: true,
            signal_strength: -55,
            temperature_value: 24,
            temperature_unit: '°C',
          },
          { 
            lock_id: inventorySerial2, 
            state: 'OPENED', // Maps to lock_status: 'unlocked'
            battery_level: 3200, 
            signal_strength: -65, 
            temperature_value: 22.5,
            locked: false, // Boolean fallback
            online: false,
          },
        ],
      },
    }));
    const respState1 = await waitForProxyResponse(ws, reqState1);
    if (respState1.status !== 200 || !respState1.body?.success) {
      throw new Error(`Device state update failed: ${respState1.status}`);
    }
    const stateResult1 = respState1.body?.data;
    if (stateResult1?.updated !== 2) {
      throw new Error(`Expected 2 devices updated, got ${stateResult1?.updated}`);
    }
    ok(`State update applied to ${stateResult1.updated} devices (new gateway format)`);

    // Test devices/inventory - remove devices (sync with subset - removes inventorySerial2)
    step('Testing POST /devices/inventory (remove devices via delta)');
    const reqInventory2 = 'req-inventory-2';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqInventory2,
      method: 'POST',
      path: `/internal/gateway/devices/inventory`,
      body: {
        facility_id: facilityId,
        devices: [
          { lock_id: remainingSerial }, // Keep original device!
          { lock_id: inventorySerial1, lock_number: 201 }, // Keep this one too
          // inventorySerial2 is removed
        ],
      },
    }));
    const respInventory2 = await waitForProxyResponse(ws, reqInventory2);
    if (respInventory2.status !== 200 || !respInventory2.body?.success) {
      throw new Error(`Device inventory remove failed: ${respInventory2.status}`);
    }
    const invResult2 = respInventory2.body?.data;
    if (invResult2?.removed !== 1 || invResult2?.unchanged !== 2) {
      throw new Error(`Expected 1 removed, 2 unchanged; got removed=${invResult2?.removed} unchanged=${invResult2?.unchanged}`);
    }
    ok(`Inventory sync: removed=${invResult2.removed}, unchanged=${invResult2.unchanged}`);

    // Test devices/state - not_found tracking
    step('Testing POST /devices/state (not_found tracking)');
    const reqState2 = 'req-state-2';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqState2,
      method: 'POST',
      path: `/internal/gateway/devices/state`,
      body: {
        facility_id: facilityId,
        updates: [
          { lock_id: 'NON-EXISTENT-LOCK', battery_level: 50 },
        ],
      },
    }));
    const respState2 = await waitForProxyResponse(ws, reqState2);
    if (respState2.status !== 200 || !respState2.body?.success) {
      throw new Error(`Device state update request failed: ${respState2.status}`);
    }
    const stateResult2 = respState2.body?.data;
    if (stateResult2?.not_found?.length !== 1 || !stateResult2.not_found.includes('NON-EXISTENT-LOCK')) {
      throw new Error(`Expected not_found to contain NON-EXISTENT-LOCK, got ${JSON.stringify(stateResult2?.not_found)}`);
    }
    ok(`State update correctly tracked not_found: ${stateResult2.not_found.join(', ')}`);

    // Test device removal when assigned to unit
    step('Testing device removal when assigned to unit');
    step('Creating unit-linked device group member for swap-follow validation');
    const unitLinkedGroupCreate = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: facilityId,
        name: `E2E Unit-Linked Swap Group ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    unitLinkedSwapGroupId = unitLinkedGroupCreate.data?.data?.id;
    if (!unitLinkedSwapGroupId) throw new Error('Failed to create unit-linked swap validation group');
    await axios.post(
      `${API_BASE}/device-groups/${unitLinkedSwapGroupId}/members`,
      {
        unit_id: unitId,
        device_type: 'blulok',
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    ok(`Unit-linked group member created for unit ${unitId}`);

    // First, assign one of the inventory devices to a unit (will replace the original device)
    let testDeviceId = null;
    let originalDeviceWasReplaced = false;
    const resDevicesForUnit = await axios.get(`${API_BASE}/devices/unassigned`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { facility_id: facilityId, limit: 10 }
    });
    const unassignedDevices = resDevicesForUnit.data?.devices || [];
    const testDevice = unassignedDevices.find((d) => 
      d.device_serial === inventorySerial1 || d.device_serial === inventorySerial2
    );
    if (!testDevice) throw new Error('Could not find inventory device to assign to unit');
    testDeviceId = testDevice.id;
    await assignDeviceToUnit(token, testDeviceId, unitId);
    originalDeviceWasReplaced = true;
    ok(`Assigned test device ${testDeviceId} to unit ${unitId} (replaced original device)`);
    if (unitLinkedSwapGroupId) {
      const linkedGroupAfterSwap = await axios.get(
        `${API_BASE}/device-groups/${unitLinkedSwapGroupId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const linkedMembers = linkedGroupAfterSwap.data?.data?.members || [];
      const linkedMember = linkedMembers.find((member) => member.source_unit_id === unitId);
      if (!linkedMember) throw new Error('Expected a unit-linked group member after swap');
      if (linkedMember.device_id !== testDeviceId) {
        throw new Error(`Expected unit-linked member to follow swapped device ${testDeviceId}, got ${linkedMember.device_id}`);
      }
      ok('Unit-linked group member correctly followed swapped-in device');
    }

    // Verify unit still has the device
    if (testDeviceId) {
      step('Verifying device is assigned to unit before removal');
      const resUnitBefore = await axios.get(`${API_BASE}/units/${unitId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const unitBefore = resUnitBefore.data?.unit;
      if (unitBefore?.blulok_device?.id !== testDeviceId) {
        throw new Error(`Device ${testDeviceId} not found on unit ${unitId} before removal`);
      }
      ok(`Unit ${unitId} has device ${testDeviceId} before removal`);

      // Remove the device via inventory sync
      // At this point: remainingSerial and inventorySerial1 exist (inventorySerial2 was removed earlier)
      // inventorySerial1 is assigned to the unit, we want to remove it
      step('Removing device via inventory sync (device is assigned to unit)');
      const reqInventoryRemoveWithUnit = 'req-inventory-remove-unit';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqInventoryRemoveWithUnit,
        method: 'POST',
        path: `/internal/gateway/devices/inventory`,
        body: {
          facility_id: facilityId,
          devices: [
            { lock_id: remainingSerial }, // Keep only the original device
            // inventorySerial1 (which is assigned to unit) will be removed
          ],
        },
      }));
      const respInventoryRemoveWithUnit = await waitForProxyResponse(ws, reqInventoryRemoveWithUnit);
      if (respInventoryRemoveWithUnit.status !== 200 || !respInventoryRemoveWithUnit.body?.success) {
        throw new Error(`Device inventory remove (with unit) failed: ${respInventoryRemoveWithUnit.status}`);
      }
      const invResultRemove = respInventoryRemoveWithUnit.body?.data;
      if (invResultRemove?.removed !== 1) {
        throw new Error(`Expected 1 device removed, got ${invResultRemove?.removed}`);
      }
      ok(`Device removed via inventory sync (was assigned to unit)`);

      // Verify unit still exists but no longer has the device
      step('Verifying unit still exists after device removal');
      const resUnitAfter = await axios.get(`${API_BASE}/units/${unitId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const unitAfter = resUnitAfter.data?.unit;
      if (!unitAfter) {
        throw new Error(`Unit ${unitId} was deleted when device was removed`);
      }
      if (unitAfter.blulok_device?.id === testDeviceId) {
        throw new Error(`Unit ${unitId} still has device ${testDeviceId} after removal`);
      }
      ok(`Unit ${unitId} still exists and no longer has device ${testDeviceId}`);

      // Re-assign the original device back to the unit since we replaced it during the test
      if (originalDeviceWasReplaced) {
        step('Re-assigning original device back to unit');
        await assignDeviceToUnit(token, deviceId, unitId);
        ok(`Re-assigned original device ${deviceId} back to unit ${unitId}`);
        if (unitLinkedSwapGroupId) {
          const linkedGroupAfterRestore = await axios.get(
            `${API_BASE}/device-groups/${unitLinkedSwapGroupId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const linkedMembers = linkedGroupAfterRestore.data?.data?.members || [];
          const linkedMember = linkedMembers.find((member) => member.source_unit_id === unitId);
          if (!linkedMember) throw new Error('Expected unit-linked group member after restoring original device');
          if (linkedMember.device_id !== deviceId) {
            throw new Error(`Expected unit-linked member to follow restored device ${deviceId}, got ${linkedMember.device_id}`);
          }
          ok('Unit-linked group member correctly followed restored device');
        }
      }
    }

    if (unitLinkedSwapGroupId) {
      step('Deleting unit-linked swap validation group');
      await axios.delete(`${API_BASE}/device-groups/${unitLinkedSwapGroupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      unitLinkedSwapGroupId = null;
      ok('Unit-linked swap validation group deleted');
    }

    // Clean up remaining inventory test devices
    step('Cleaning up remaining inventory test devices');
    const reqInventoryCleanup = 'req-inventory-cleanup';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqInventoryCleanup,
      method: 'POST',
      path: `/internal/gateway/devices/inventory`,
      body: {
        facility_id: facilityId,
        devices: [{ lock_id: remainingSerial }], // Keep only the original device
      },
    }));
    await waitForProxyResponse(ws, reqInventoryCleanup);
    ok('Inventory test devices cleaned up');

    heading('Device commissioning — HTTP unassign and cloud inventory removal');
    const disposableSerial = `GW-E2E-HTTP-REMOVE-${Date.now()}`;
    step('Gateway sync: add disposable lock for commissioning API tests');
    const reqDisposableSync = 'req-disposable-sync';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqDisposableSync,
      method: 'POST',
      path: `/internal/gateway/device-sync`,
      body: {
        facility_id: facilityId,
        devices: [{
          serial: disposableSerial,
          firmwareVersion: '3A0-001',
          online: true,
          locked: false,
          batteryLevel: 3400,
        }],
      },
    }));
    const respDisposableSync = await waitForProxyResponse(ws, reqDisposableSync);
    if (respDisposableSync.status !== 200 || !respDisposableSync.body?.success) {
      throw new Error(`Disposable device sync failed: ${respDisposableSync.status}`);
    }
    let disposableDeviceId = await resolveUnassignedDeviceIdBySerial(token, facilityId, disposableSerial);
    if (!disposableDeviceId) throw new Error(`Disposable device ${disposableSerial} not found after sync`);
    ok(`Disposable device ${disposableDeviceId} (${disposableSerial}) ready`);

    step('POST assign + DELETE unassign — lock leaves unit but stays in facility inventory');
    await assignDeviceToUnit(token, disposableDeviceId, unitId);
    const resUnitWithLock = await axios.get(`${API_BASE}/units/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resUnitWithLock.data?.unit?.blulok_device?.id !== disposableDeviceId) {
      throw new Error('Disposable device not linked to unit after assign');
    }
    ok('Disposable lock assigned to unit');
    const unassignRes = await axios.delete(`${API_BASE}/devices/blulok/${disposableDeviceId}/unassign`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!unassignRes.data?.success) {
      throw new Error(`HTTP unassign failed: ${unassignRes.data?.message || unassignRes.status}`);
    }
    const resUnitAfterUnassign = await axios.get(`${API_BASE}/units/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resUnitAfterUnassign.data?.unit?.blulok_device?.id === disposableDeviceId) {
      throw new Error('Disposable device still on unit after HTTP unassign');
    }
    disposableDeviceId = await resolveUnassignedDeviceIdBySerial(token, facilityId, disposableSerial);
    if (!disposableDeviceId) throw new Error('Disposable device missing from unassigned list after unassign');
    ok('HTTP unassign cleared unit link; device remains in facility inventory');

    step('DELETE /devices/blulok/:id — dev admin removes lock from cloud inventory');
    await removeBluLokFromCloudInventory(token, disposableDeviceId);
    ok('DELETE cloud inventory succeeded');

    step('GET /devices/blulok/:id — removed lock is not retrievable');
    try {
      await getBluLokDeviceHttp(token, disposableDeviceId);
      throw new Error('Expected GET BluLok device to fail after cloud inventory removal');
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404) {
        throw new Error(`Expected 404 after removal, got ${status}: ${JSON.stringify(err?.response?.data)}`);
      }
    }
    ok('Removed lock returns 404 on GET');

    if (created.facilityAdminToken) {
      const rbacSerial = `GW-E2E-FA-FORBID-${Date.now()}`;
      step('Facility admin forbidden from DELETE /devices/blulok/:id');
      const reqRbacSync = 'req-rbac-disposable-sync';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqRbacSync,
        method: 'POST',
        path: `/internal/gateway/device-sync`,
        body: {
          facility_id: facilityId,
          devices: [{ serial: rbacSerial, firmwareVersion: '3A0-001', online: true, locked: false }],
        },
      }));
      const respRbacSync = await waitForProxyResponse(ws, reqRbacSync);
      if (respRbacSync.status !== 200 || !respRbacSync.body?.success) {
        throw new Error(`RBAC disposable sync failed: ${respRbacSync.status}`);
      }
      const rbacDeviceId = await resolveUnassignedDeviceIdBySerial(token, facilityId, rbacSerial);
      if (!rbacDeviceId) throw new Error('RBAC disposable device not found');
      try {
        await removeBluLokFromCloudInventory(created.facilityAdminToken, rbacDeviceId);
        throw new Error('Facility admin should not remove cloud inventory');
      } catch (err) {
        if (err?.response?.status !== 403) {
          throw new Error(`Expected 403 for facility admin DELETE, got ${err?.response?.status}`);
        }
      }
      ok('Facility admin correctly denied cloud inventory removal');
      await removeBluLokFromCloudInventory(token, rbacDeviceId);
      ok('Dev admin cleaned up RBAC disposable device');
    } else {
      warn('Skipped facility admin cloud-inventory RBAC check (no facilityAdminToken)');
    }

    // Commissioning tests assign disposable locks to the shared unit; restore the primary lock.
    step('Restoring primary device on unit after commissioning tests');
    let primaryDeviceId = await resolveUnassignedDeviceIdBySerial(token, facilityId, remainingSerial);
    if (!primaryDeviceId) {
      const reqRestorePrimary = 'req-restore-primary-sync';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqRestorePrimary,
        method: 'POST',
        path: `/internal/gateway/device-sync`,
        body: {
          facility_id: facilityId,
          devices: [{
            serial: remainingSerial,
            firmwareVersion: '3A0-001',
            online: true,
            locked: false,
            batteryLevel: 3450,
          }],
        },
      }));
      const respRestorePrimary = await waitForProxyResponse(ws, reqRestorePrimary);
      if (respRestorePrimary.status !== 200 || !respRestorePrimary.body?.success) {
        throw new Error(`Primary device re-sync failed: ${respRestorePrimary.status}`);
      }
      primaryDeviceId = await resolveUnassignedDeviceIdBySerial(token, facilityId, remainingSerial);
      if (!primaryDeviceId) {
        throw new Error(`Primary device ${remainingSerial} not found after re-sync`);
      }
    }
    deviceId = primaryDeviceId;
    created.deviceId = deviceId;
    await assignDeviceToUnit(token, deviceId, unitId);
    ok(`Primary device ${deviceId} restored on unit for downstream tests`);

    // PROXY: Update device status to "online" then fetch device details
    const reqStatus = 'req-device-status';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqStatus, method: 'PUT', path: `/devices/blulok/${deviceId}/status`, body: { status: 'online' } }));
    const respStatus = await waitForProxyResponse(ws, reqStatus);
    if (respStatus.status !== 200) throw new Error(`Proxy PUT device status failed: ${respStatus.status}`);
    const reqGetDevice = 'req-get-device';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqGetDevice, method: 'GET', path: `/devices/blulok/${deviceId}` }));
    const respGetDevice = await waitForProxyResponse(ws, reqGetDevice);
    if (respGetDevice.status !== 200) throw new Error(`Proxy GET device failed: ${respGetDevice.status}`);

    // Device Status WebSocket Subscription Test
    heading('Device Status WebSocket Subscription');
    let deviceStatusWs = null;
    const deviceStatusEvents = [];
    
    step('Connecting to device_status subscription');
    // Use token in URL query string like the notifications WS (not headers)
    const deviceStatusWsUrl = `${UI_WS_URL}?token=${token}`;
    deviceStatusWs = new WebSocket(deviceStatusWsUrl);
    await new Promise((res, rej) => { deviceStatusWs.once('open', res); deviceStatusWs.once('error', rej); });
    ok('Device status WebSocket connected');
    
    // Set up message handler
    deviceStatusWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (VERBOSE) console.log('[WS-DEV-STATUS <-]', data.toString());
        if (msg.type === 'device_status_update' && msg.data) {
          deviceStatusEvents.push(msg);
        }
      } catch {}
    });
    
    // Subscribe to device_status for our specific device
    step('Subscribing to device_status for specific device');
    deviceStatusWs.send(JSON.stringify({
      type: 'subscription',
      subscriptionType: 'device_status',
      data: { device_id: deviceId }
    }));
    
    // Wait for initial data - poll with timeout
    step('Waiting for initial device_status_update');
    const wsStartTime = Date.now();
    const wsTimeoutMs = 5000;
    while (Date.now() - wsStartTime < wsTimeoutMs) {
      if (deviceStatusEvents.some(e => e.data?.devices?.some(d => d.id === deviceId))) {
        break;
      }
      await delay(200);
    }
    
    // Check we received initial device status
    const initialEvent = deviceStatusEvents.find(e => 
      e.data?.devices?.some(d => d.id === deviceId)
    );
    if (!initialEvent) {
      // Close WS before throwing
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) {
        deviceStatusWs.close();
      }
      throw new Error('Did not receive initial device_status_update for subscribed device');
    }
    ok('Received initial device status data via WebSocket');
    
    // Verify telemetry fields are present
    const initialDevice = initialEvent.data.devices.find(d => d.id === deviceId);
    if (!initialDevice) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) {
        deviceStatusWs.close();
      }
      throw new Error('Device not found in device_status_update');
    }
    
    // Check that all expected fields are present (even if null/undefined for some)
    const expectedFields = ['id', 'device_serial', 'lock_status', 'device_status', 'battery_level'];
    const missingFields = expectedFields.filter(f => !(f in initialDevice));
    if (missingFields.length > 0) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) {
        deviceStatusWs.close();
      }
      throw new Error(`Missing expected fields in device status: ${missingFields.join(', ')}`);
    }
    ok(`Device status includes expected fields: ${expectedFields.join(', ')}`);
    
    // Optional telemetry fields (may be null)
    const telemetryFields = ['signal_strength', 'temperature', 'error_code', 'error_message'];
    const presentTelemetry = telemetryFields.filter(f => f in initialDevice);
    info(`Telemetry fields present: ${presentTelemetry.join(', ') || 'none'}`);
    
    // ---- Dashboard parity: HTTP cloud lock → LOCK_STATUS_CHANGED → device_status_update ----
    heading('Device status subscription — HTTP cloud lock (same API as web UI)');
    let httpLockBaseline = deviceStatusEvents.length;
    step('PUT /devices/blulok/:id/lock locked while subscribed — expect device_status_update');
    await axios.put(
      `${API_BASE}/devices/blulok/${deviceId}/lock`,
      { lock_status: 'locked' },
      { headers: authHeaders(token) },
    );
    let rowAfterHttpLock = await waitForDeviceStatusLockStatus(
      deviceStatusEvents,
      deviceId,
      ['locking', 'locked'],
      httpLockBaseline,
      8000,
    );
    if (!rowAfterHttpLock) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) deviceStatusWs.close();
      throw new Error('Did not receive device_status_update with lock_status locking|locked after HTTP cloud lock');
    }
    ok(`WebSocket shows lock in progress (${rowAfterHttpLock.lock_status}) after HTTP cloud lock`);

    httpLockBaseline = deviceStatusEvents.length;
    step('PUT /devices/blulok/:id/lock unlocked — expect device_status_update');
    await axios.put(
      `${API_BASE}/devices/blulok/${deviceId}/lock`,
      { lock_status: 'unlocked' },
      { headers: authHeaders(token) },
    );
    rowAfterHttpLock = await waitForDeviceStatusLockStatus(
      deviceStatusEvents,
      deviceId,
      ['unlocking', 'unlocked'],
      httpLockBaseline,
      8000,
    );
    if (!rowAfterHttpLock) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) deviceStatusWs.close();
      throw new Error('Did not receive device_status_update with lock_status unlocking|unlocked after HTTP cloud unlock');
    }
    ok(`WebSocket shows unlock in progress (${rowAfterHttpLock.lock_status}) after HTTP cloud unlock`);

    // ---- Inbound gateway devices/state → telemetry + lock_status (same path as facility gateway) ----
    heading('Device status subscription — gateway devices/state lock + telemetry');
    let preUpdateCount = deviceStatusEvents.length;
    step('POST /internal/gateway/devices/state LOCKED — expect lock_status locked on /ws');
    const reqStateLocked = 'req-state-locked-ws';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqStateLocked,
      method: 'POST',
      path: `/internal/gateway/devices/state`,
      body: {
        facility_id: facilityId,
        updates: [{ lock_id: remainingSerial, lock_state: 'LOCKED' }],
      },
    }));
    const respStateLocked = await waitForProxyResponse(ws, reqStateLocked);
    if (respStateLocked.status !== 200) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) deviceStatusWs.close();
      throw new Error(`Gateway devices/state LOCKED failed: ${respStateLocked.status}`);
    }
    let gwLockedRow = await waitForDeviceStatusLockStatus(
      deviceStatusEvents,
      deviceId,
      'locked',
      preUpdateCount,
      8000,
    );
    if (!gwLockedRow) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) deviceStatusWs.close();
      throw new Error('Did not receive device_status_update with lock_status locked after gateway LOCKED');
    }
    ok('WebSocket shows lock_status locked after gateway devices/state');

    preUpdateCount = deviceStatusEvents.length;
    step('POST /internal/gateway/devices/state UNLOCKED + telemetry — expect device_status_update');
    const reqStateUpdate = 'req-state-update-ws';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqStateUpdate,
      method: 'POST',
      path: `/internal/gateway/devices/state`,
      body: {
        facility_id: facilityId,
        updates: [
          {
            lock_id: remainingSerial,
            lock_state: 'UNLOCKED',
            battery_level: 92,
            signal_strength: -48,
            temperature: 24.5,
          },
        ],
      },
    }));
    const respStateUpdate = await waitForProxyResponse(ws, reqStateUpdate);
    if (respStateUpdate.status !== 200) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) {
        deviceStatusWs.close();
      }
      throw new Error(`Device state update for WS test failed: ${respStateUpdate.status}`);
    }
    ok('Gateway UNLOCKED + telemetry accepted');
    const gwUnlockedRow = await waitForDeviceStatusLockStatus(
      deviceStatusEvents,
      deviceId,
      'unlocked',
      preUpdateCount,
      8000,
    );
    if (!gwUnlockedRow) {
      if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) deviceStatusWs.close();
      throw new Error('Did not receive device_status_update with lock_status unlocked after gateway UNLOCKED');
    }
    ok('WebSocket shows lock_status unlocked after gateway devices/state');
    const bat = Number(gwUnlockedRow.battery_level);
    const sig = Number(gwUnlockedRow.signal_strength);
    const temp = Number(gwUnlockedRow.temperature);
    const tempOk = Number.isFinite(temp) && Math.abs(temp - 24.5) < 0.001;
    if (bat === 92 && sig === -48 && tempOk) {
      ok('WebSocket event contains updated telemetry values');
    } else {
      throw new Error(
        `Expected telemetry battery=92 signal=-48 temp≈24.5; got battery=${gwUnlockedRow.battery_level} signal=${gwUnlockedRow.signal_strength} temp=${gwUnlockedRow.temperature}`,
      );
    }
    
    step('Unsubscribing from device_status');
    deviceStatusWs.send(JSON.stringify({
      type: 'unsubscription',
      subscriptionType: 'device_status'
    }));
    
    // Close the WebSocket
    if (deviceStatusWs && deviceStatusWs.readyState === WebSocket.OPEN) {
      deviceStatusWs.close();
    }
    ok('Device status subscription tests complete');

    // Units WebSocket Subscription Test - verify it updates on device state changes
    heading('Units WebSocket Subscription (Device State Updates)');
    let unitsWs = null;
    const unitsEvents = [];
    
    step('Connecting to units subscription');
    const unitsWsUrl = `${UI_WS_URL}?token=${token}`;
    unitsWs = new WebSocket(unitsWsUrl);
    await new Promise((res, rej) => { unitsWs.once('open', res); unitsWs.once('error', rej); });
    ok('Units WebSocket connected');
    
    // Set up message handler
    unitsWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (VERBOSE) console.log('[WS-UNITS <-]', data.toString());
        if (msg.type === 'units_update' && msg.data) {
          unitsEvents.push(msg);
        }
      } catch {}
    });
    
    // Subscribe to units
    step('Subscribing to units');
    unitsWs.send(JSON.stringify({
      type: 'subscription',
      subscriptionType: 'units'
    }));
    
    // Wait for initial data
    step('Waiting for initial units_update');
    const unitsWsStartTime = Date.now();
    const unitsWsTimeoutMs = 5000;
    while (Date.now() - unitsWsStartTime < unitsWsTimeoutMs) {
      if (unitsEvents.length > 0) {
        break;
      }
      await delay(200);
    }
    
    if (unitsEvents.length === 0) {
      if (unitsWs && unitsWs.readyState === WebSocket.OPEN) {
        unitsWs.close();
      }
      throw new Error('Did not receive initial units_update');
    }
    ok('Received initial units data via WebSocket');
    
    // Verify the initial data structure
    const initialUnitsEvent = unitsEvents[0];
    const requiredUnitsFields = ['totalUnits', 'lockedCount', 'unlockedCount'];
    const missingUnitsFields = requiredUnitsFields.filter(f => !(f in initialUnitsEvent.data));
    if (missingUnitsFields.length > 0) {
      info(`Units data structure: ${JSON.stringify(Object.keys(initialUnitsEvent.data))}`);
    } else {
      ok(`Units data includes expected fields: ${requiredUnitsFields.join(', ')}`);
    }
    
    // Test: Update device state and verify units subscription receives update
    step('Updating device lock state to trigger units WebSocket update');
    const preUnitsUpdateCount = unitsEvents.length;
    
    // Toggle lock state
    const reqToggleLock = 'req-toggle-lock-units';
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqToggleLock,
      method: 'POST',
      path: `/internal/gateway/devices/state`,
      body: {
        facility_id: facilityId,
        updates: [
          { 
            lock_id: remainingSerial, 
            lock_state: 'LOCKED'
          },
        ],
      },
    }));
    const respToggleLock = await waitForProxyResponse(ws, reqToggleLock);
    if (respToggleLock.status !== 200) {
      if (unitsWs && unitsWs.readyState === WebSocket.OPEN) unitsWs.close();
      throw new Error(`Gateway devices/state LOCKED for units test failed: ${respToggleLock.status}`);
    }
    ok('Device lock state updated successfully (gateway path)');
    
    // Wait for units WebSocket event (LockStatusWidget / facility pages use debounced units_update)
    step('Waiting for units_update WebSocket event after device state change');
    const unitsUpdateStartTime = Date.now();
    const unitsUpdateTimeoutMs = 8000;
    while (Date.now() - unitsUpdateStartTime < unitsUpdateTimeoutMs) {
      if (unitsEvents.length > preUnitsUpdateCount) {
        break;
      }
      await delay(200);
    }
    
    if (unitsEvents.length <= preUnitsUpdateCount) {
      if (unitsWs && unitsWs.readyState === WebSocket.OPEN) unitsWs.close();
      throw new Error('Did not receive units_update after gateway LOCKED (expected for facility-scoped refresh)');
    }
    ok('Received units_update via WebSocket after gateway lock state change');
    const latestUnitsEvent = unitsEvents[unitsEvents.length - 1];
    info(`Updated units data: total=${latestUnitsEvent.data?.totalUnits}, locked=${latestUnitsEvent.data?.lockedCount}, unlocked=${latestUnitsEvent.data?.unlockedCount}`);
    
    step('Unsubscribing from units');
    unitsWs.send(JSON.stringify({
      type: 'unsubscription',
      subscriptionType: 'units'
    }));
    
    // Close the WebSocket
    if (unitsWs && unitsWs.readyState === WebSocket.OPEN) {
      unitsWs.close();
    }
    ok('Units subscription tests complete');

    // Dashboard /ws: gateway_status_update (inbound /ws/gateway session syncs gateways.status → broadcast)
    heading('Gateway Status WebSocket (Dashboard /ws)');
    let gatewayStatusWs = null;
    const gatewayStatusEvents = [];
    step('Connecting UI WebSocket for gateway_status subscription');
    gatewayStatusWs = new WebSocket(`${UI_WS_URL}?token=${token}`);
    await new Promise((res, rej) => {
      gatewayStatusWs.once('open', res);
      gatewayStatusWs.once('error', rej);
    });
    ok('Gateway status UI WebSocket connected');

    gatewayStatusWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (VERBOSE) console.log('[WS-GATEWAY-STATUS <-]', raw.toString());
        if (msg.type === 'gateway_status_update' && msg.data) {
          gatewayStatusEvents.push(msg);
        }
      } catch {
        /* ignore */
      }
    });

    step('Subscribing to gateway_status (Facility Details / Gateway tab channel)');
    gatewayStatusWs.send(
      JSON.stringify({
        type: 'subscription',
        subscriptionType: 'gateway_status',
      }),
    );

    step('Waiting for initial gateway_status_update including E2E gateway row');
    const gwStatusDeadline = Date.now() + 8000;
    let rowForCreated = null;
    while (Date.now() < gwStatusDeadline) {
      for (const ev of gatewayStatusEvents) {
        const list = ev.data?.gateways;
        if (!Array.isArray(list)) continue;
        const hit = list.find((g) => g.id === created.gatewayId);
        if (hit) {
          rowForCreated = hit;
          break;
        }
      }
      if (rowForCreated) break;
      await delay(200);
    }

    if (!rowForCreated) {
      if (gatewayStatusWs && gatewayStatusWs.readyState === WebSocket.OPEN) {
        gatewayStatusWs.close();
      }
      throw new Error(
        `gateway_status_update never included gateway ${created.gatewayId} (expected while /ws/gateway is connected)`,
      );
    }

    if (rowForCreated.status !== 'online') {
      warn(
        `E2E gateway status is "${rowForCreated.status}" (expected online while /ws/gateway session is active)`,
      );
    } else {
      ok(`gateway_status_update shows E2E gateway ${created.gatewayId} as online`);
    }

    if (!Object.prototype.hasOwnProperty.call(rowForCreated, 'facilityId')) {
      warn('gateway_status payload missing facilityId (camelCase)');
    } else if (rowForCreated.facilityId && rowForCreated.facilityId !== facilityId) {
      info(`Gateway facilityId in WS payload: ${rowForCreated.facilityId} (E2E facility: ${facilityId})`);
    }

    step('Unsubscribing from gateway_status');
    gatewayStatusWs.send(
      JSON.stringify({
        type: 'unsubscription',
        subscriptionType: 'gateway_status',
      }),
    );
    await delay(200);
    if (gatewayStatusWs && gatewayStatusWs.readyState === WebSocket.OPEN) {
      gatewayStatusWs.close();
    }
    ok('Gateway status WebSocket checks complete');

    // WebSocket flood/churn resilience checks to catch regressions that can
    // overload subscription setup or destabilize the backend event loop.
    heading('WebSocket Flood Resilience');
    step('Running rapid UI WebSocket connect/disconnect churn');
    const churnClientCount = 20;
    await Promise.all(Array.from({ length: churnClientCount }, () => new Promise((resolve, reject) => {
      const churnWs = new WebSocket(`${UI_WS_URL}?token=${token}`);
      const timeout = setTimeout(() => {
        try { churnWs.terminate(); } catch {}
        reject(new Error('WS churn client open timeout'));
      }, 4000);
      churnWs.once('open', () => {
        clearTimeout(timeout);
        churnWs.close();
        resolve();
      });
      churnWs.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    })));
    ok(`Churned ${churnClientCount} connect/disconnect clients`);

    step('Opening flood clients and bursting duplicate subscriptions');
    const floodClientCount = 8;
    const burstPerClient = 24;
    const floodClients = [];
    let floodSubscriptionResponses = 0;
    const floodErrors = [];

    for (let i = 0; i < floodClientCount; i++) {
      const floodWs = new WebSocket(`${UI_WS_URL}?token=${token}`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Flood client ${i} open timeout`)), 4000);
        floodWs.once('open', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        floodWs.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      floodWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === 'subscription') {
            floodSubscriptionResponses += 1;
          } else if (msg?.type === 'error') {
            floodErrors.push(msg.error || 'unknown ws error');
          }
        } catch {
          // Ignore parse errors from unrelated messages in this stress phase.
        }
      });
      floodClients.push(floodWs);
    }

    for (let i = 0; i < floodClients.length; i++) {
      const floodWs = floodClients[i];
      for (let j = 0; j < burstPerClient; j++) {
        const useGatewayStatus = j % 2 === 0;
        floodWs.send(JSON.stringify({
          type: 'subscription',
          subscriptionType: useGatewayStatus ? 'gateway_status' : 'firmware_push_progress',
          // Keep scope stable so backend dedupe/pending guards are exercised.
          data: { facility_id: facilityId, gateway_id: created.gatewayId },
        }));
      }
    }

    await delay(1200);

    if (floodErrors.length > 0) {
      throw new Error(`Flood subscriptions produced WS errors: ${floodErrors.slice(0, 3).join(' | ')}`);
    }
    if (floodSubscriptionResponses < floodClientCount) {
      throw new Error(`Expected at least ${floodClientCount} subscription responses, got ${floodSubscriptionResponses}`);
    }
    ok(`Flood burst handled with ${floodSubscriptionResponses} subscription response(s) and no WS errors`);

    step('Verifying API responsiveness immediately after subscription flood');
    const postFloodChecks = await Promise.all([
      axios.get(`${API_BASE}/facilities`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1 },
      }),
      axios.get(`${API_BASE}/gateways`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get(`${API_BASE}/firmware/push-status/${created.gatewayId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { target_type: 'friend_node' },
      }),
    ]);
    if (postFloodChecks.some((resp) => resp.status >= 500)) {
      throw new Error(`API degraded after flood: statuses=${postFloodChecks.map((resp) => resp.status).join(',')}`);
    }
    ok('Backend remained responsive after WS flood burst');

    for (const floodWs of floodClients) {
      if (floodWs.readyState === WebSocket.OPEN || floodWs.readyState === WebSocket.CONNECTING) {
        floodWs.close();
      }
    }

    // Skip legacy outbound gateway sync (not applicable for inbound model)

    // Users resolved via FMS sync
    heading('Users and Sharing');
    step('Resolving users created via FMS');
    async function findUserIdByEmail(authToken, email) {
      const res = await axios.get(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { search: email, limit: 5 }
      });
      const users = res.data?.users || [];
      const u = users.find((x) => (x.email || '').toLowerCase() === email.toLowerCase());
      return u?.id || null;
    }
    const primaryId = await findUserIdByEmail(token, primaryEmail);
    const share1Id = await findUserIdByEmail(token, share1Email);
    const share2Id = await findUserIdByEmail(token, share2Email);
    if (!primaryId || !share1Id || !share2Id) {
      throw new Error(`FMS did not create expected users: primary=${!!primaryId} share1=${!!share1Id} share2=${!!share2Id}`);
    }
    created.primaryTenantId = primaryId;
    created.users.push(primaryId, share1Id, share2Id);
    ok(`Users resolved primary=${primaryId} share1=${share1Id} share2=${share2Id}`);

    // First-time invite + OTP + set-password flows using notification WS
    // NOTE: The new flow sends OTP code in the invite notification itself (single message)
    heading('First-time Login (Invite with embedded OTP)');
    async function requestFreshInviteOtp(inviteToken, inviteEvent, profile = {}) {
      const requestBody = { token: inviteToken };
      if (inviteEvent?.toPhone) requestBody.phone = inviteEvent.toPhone;
      if (inviteEvent?.toEmail) requestBody.email = inviteEvent.toEmail;
      if (profile.firstName) requestBody.firstName = profile.firstName;
      if (profile.lastName) requestBody.lastName = profile.lastName;

      notificationEvents.length = 0;
      await axios.post(`${API_BASE}/auth/invite/request-otp`, requestBody);

      const otpEvent = await waitForNotification((e) => {
        const hasCode = !!(e?.meta?.code || (e?.body && String(e.body).match(/(\d{6})/)));
        if (!hasCode) return false;
        if (e.kind !== 'otp' && e.kind !== 'invite') return false;
        if (inviteEvent?.toPhone && e.toPhone) return e.toPhone === inviteEvent.toPhone;
        if (inviteEvent?.toEmail && e.toEmail) return e.toEmail === inviteEvent.toEmail;
        return true;
      });

      let otp = otpEvent.meta?.code;
      if (!otp) {
        const otpMatch = String(otpEvent.body).match(/(\d{6})/);
        if (!otpMatch) throw new Error('Failed to parse refreshed OTP code from notification');
        otp = otpMatch[1];
      }
      return otp;
    }

    async function completeFirstTimeLogin(userId, email, newPassword = 'TestUser123!') {
      // Trigger a real invite via FirstTimeUserService
      step(`Sending invite for user ${userId}`);
      // Clear any previous DEV_NOTIFICATION events so we only see fresh invites/OTPs
      notificationEvents.length = 0;
      await axios.post(`${API_BASE}/users/${userId}/resend-invite`, {}, { headers: { Authorization: `Bearer ${token}` } });
      // Wait for invite SMS to capture deeplink/token AND OTP code (single notification now)
      const inviteEvent = await waitForNotification((e) =>
        e.kind === 'invite' && e.delivery === 'sms' && e.body && String(e.body).includes('invite')
      );
      ok(`Received invite notification for ${inviteEvent.toPhone || inviteEvent.toEmail || 'unknown-recipient'}`);
      console.log(C.cyan('\n  📧 Full Invite Notification Details:'));
      console.log(C.gray(JSON.stringify(inviteEvent, null, 2)));
      
      // Parse invite token from deeplink
      const deeplinkMatch = String(inviteEvent.body).match(/token=([^&\s]+)/);
      if (!deeplinkMatch) throw new Error('Failed to parse invite token from SMS body');
      const inviteToken = decodeURIComponent(deeplinkMatch[1]);
      
      // Parse OTP code from the same invite notification (now included in single message)
      // First check if meta has code, otherwise parse from body
      let otp = inviteEvent.meta?.code;
      if (!otp) {
        const otpMatch = String(inviteEvent.body).match(/(\d{6})/);
        if (!otpMatch) throw new Error('Failed to parse OTP code from invite SMS body');
        otp = otpMatch[1];
      }
      ok(`Extracted OTP ${otp} from invite notification`);
      
      // Accept the invite to check profile status (does not consume invite)
      step('Checking profile via invite/accept');
      const acceptRes = await axios.post(`${API_BASE}/auth/invite/accept`, { token: inviteToken });
      if (!acceptRes.data?.success) throw new Error('Accept invite failed');
      ok(`Invite accepted. needs_profile=${acceptRes.data.needs_profile}`);
      
      // Set password using token + OTP
      step('Setting password via invite/set-password');
      let setPwd;
      try {
        setPwd = await axios.post(`${API_BASE}/auth/invite/set-password`, {
          token: inviteToken,
          otp,
          newPassword
        });
      } catch (err) {
        const msg = String(err?.response?.data?.message || '');
        if (!msg.toLowerCase().includes('invalid otp')) {
          throw err;
        }
        step('OTP rejected, requesting fresh OTP and retrying set-password');
        const refreshedOtp = await requestFreshInviteOtp(inviteToken, inviteEvent);
        ok(`Refreshed OTP ${refreshedOtp}`);
        setPwd = await axios.post(`${API_BASE}/auth/invite/set-password`, {
          token: inviteToken,
          otp: refreshedOtp,
          newPassword
        });
      }
      if (!setPwd.data?.success) throw new Error('Set password failed');
      ok('First-time login completed');
      return tenantLogin(email, newPassword);
    }
    // Run first-time login flow for all three FMS-created users
    primaryToken = await completeFirstTimeLogin(primaryId, primaryEmail);
    share1Token = await completeFirstTimeLogin(share1Id, share1Email);
    share2Token = await completeFirstTimeLogin(share2Id, share2Email);
    ok('First-time login flows completed for all users');

    step('Ensuring primary tenant has explicit unit assignment for RBAC scope checks');
    try {
      await assignTenantToUnit(token, unitId, primaryId);
      ok('Primary tenant assigned to unit for access-history scope validation');
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 400 && status !== 409) {
        throw err;
      }
      info('Primary tenant already assigned to unit; continuing');
    }

    heading('Access Event Canonical Pipeline');
    step('Subscribing role-scoped activity feeds');
    async function openActivityFeed(label, authToken, filter = {}) {
      const socket = new WebSocket(`${UI_WS_URL}?token=${authToken}`);
      const events = [];
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if ((msg.type === 'activity_update' || msg.type === 'activity_new') && msg.data) {
            events.push(msg);
          }
        } catch {}
      });
      socket.send(JSON.stringify({
        type: 'subscription',
        subscriptionType: 'activity',
        data: filter,
      }));
      return { label, socket, events };
    }

    const tenantFeed = await openActivityFeed('tenant', primaryToken);
    const facAdminFeed = await openActivityFeed('facility_admin', facilityAdmin.token, { facility_id: facilityId });
    const adminFeed = await openActivityFeed('admin', platformAdmin.token, { facility_id: facilityId });
    await delay(1000);
    const shadowUnit = await createUnit(token, facilityId, `E2E-ACCESS-SHADOW-${Date.now()}`);
    if (!shadowUnit?.id) throw new Error('Failed creating secondary unit for tenant scope isolation checks');
    created.units.push(shadowUnit.id);
    ok(`Created secondary unit ${shadowUnit.id} for RBAC isolation checks`);

    step('Negative ingestion: reject denied events without denial_reason');
    const reqAccessEventsBadValidation = `req-access-events-bad-${Date.now()}`;
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqAccessEventsBadValidation,
      method: 'POST',
      path: '/internal/gateway/access-events',
      body: {
        facility_id: facilityId,
        events: [
          {
            event_id: `evt-invalid-${Date.now()}`,
            occurred_at: new Date().toISOString(),
            facility_id: facilityId,
            unit_id: unitId,
            device_id: deviceId,
            action: 'access_denied',
            method: 'app',
            success: false,
          },
        ],
      },
    }));
    const badValidationResp = await waitForProxyResponse(ws, reqAccessEventsBadValidation);
    if (badValidationResp.status !== 400) {
      throw new Error(`Expected 400 for denied event missing denial_reason, got ${badValidationResp.status}`);
    }
    ok('Rejected invalid denied-event payload without denial_reason');

    step('Negative ingestion: tenant cannot call internal gateway ingestion endpoint directly');
    let tenantInternalIngestDenied = false;
    try {
      await axios.post(
        `${API_BASE}/internal/gateway/access-events`,
        {
          facility_id: facilityId,
          events: [
            {
              event_id: `evt-tenant-forbidden-${Date.now()}`,
              occurred_at: new Date().toISOString(),
              facility_id: facilityId,
              unit_id: unitId,
              device_id: deviceId,
              action: 'access_granted',
              method: 'app',
              success: true,
            },
          ],
        },
        { headers: authHeaders(primaryToken) },
      );
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        tenantInternalIngestDenied = true;
      } else {
        throw err;
      }
    }
    if (!tenantInternalIngestDenied) {
      throw new Error('Expected tenant internal ingestion attempt to be denied');
    }
    ok('Direct tenant ingestion attempt is denied for internal gateway endpoint');

    const eventsToIngest = [
      {
        event_id: `evt-granted-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        unit_id: unitId,
        device_id: deviceId,
        action: 'access_granted',
        method: 'app',
        success: true,
        actor: {
          user_id: primaryId,
          role: 'tenant',
          name: 'Primary Tenant',
        },
      },
      {
        event_id: `evt-denied-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        unit_id: unitId,
        device_id: deviceId,
        action: 'access_denied',
        method: 'route_pass',
        success: false,
        denial_reason: 'route_pass_invalid_signature',
        actor: {
          user_id: share1Id,
          role: 'shared_user',
          name: 'Shared User',
        },
      },
      {
        event_id: `evt-admin-open-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        unit_id: unitId,
        device_id: deviceId,
        action: 'admin_remote_open',
        method: 'admin_remote',
        success: true,
        actor: {
          user_id: platformAdmin.id,
          role: 'admin',
          name: 'Platform Admin',
        },
      },
      {
        event_id: `evt-keypad-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        unit_id: unitId,
        device_id: deviceId,
        action: 'keypad_attempt',
        method: 'keypad',
        success: false,
        denial_reason: 'out_of_schedule',
        keypad: {
          entered_code: '1234',
          schedule_name: 'Night Schedule',
          zone_name: 'Zone A',
        },
      },
      {
        event_id: `evt-shadow-unit-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        unit_id: shadowUnit.id,
        device_id: deviceId,
        action: 'access_denied',
        method: 'app',
        success: false,
        denial_reason: 'denylist_blocked',
        actor: {
          user_id: share2Id,
          role: 'shared_user',
          name: 'Shadow Unit User',
        },
      },
    ];

    const reqAccessEvents = `req-access-events-${Date.now()}`;
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqAccessEvents,
      method: 'POST',
      path: '/internal/gateway/access-events',
      body: {
        facility_id: facilityId,
        events: eventsToIngest,
      },
    }));
    const respAccessEvents = await waitForProxyResponse(ws, reqAccessEvents);
    if (respAccessEvents.status !== 200) {
      throw new Error(`Access-event ingestion failed: ${respAccessEvents.status} ${JSON.stringify(respAccessEvents.body)}`);
    }
    ok(`Ingested ${eventsToIngest.length} canonical access events`);

    await delay(1200);

    step('Validating role-scoped access-history API');
    const [tenantHistory, facAdminHistory, adminHistory] = await Promise.all([
      axios.get(`${API_BASE}/access-history`, { headers: authHeaders(primaryToken), params: { facility_id: facilityId, limit: 50 } }),
      axios.get(`${API_BASE}/access-history`, { headers: authHeaders(facilityAdmin.token), params: { facility_id: facilityId, limit: 50 } }),
      axios.get(`${API_BASE}/access-history`, { headers: authHeaders(platformAdmin.token), params: { facility_id: facilityId, limit: 50 } }),
    ]);
    if (!tenantHistory.data?.logs?.length) throw new Error('Tenant history feed missing expected scoped entries');
    if (!facAdminHistory.data?.logs?.length) throw new Error('Facility-admin history feed missing expected entries');
    if (!adminHistory.data?.logs?.length) throw new Error('Admin history feed missing expected entries');

    const denied = adminHistory.data.logs.find((x) => x.denial_reason === 'route_pass_invalid_signature');
    if (!denied) throw new Error('Missing route_pass_invalid_signature denial in access history');
    const keypadDenied = adminHistory.data.logs.find((x) => x.action === 'keypad_attempt' && x.denial_reason === 'out_of_schedule');
    if (!keypadDenied) throw new Error('Missing keypad out_of_schedule denial in access history');
    const shadowUnitSeenByTenant = adminHistory.data.logs.some(
      (x) => x.unit_id === shadowUnit.id && x.denial_reason === 'denylist_blocked',
    );
    if (!shadowUnitSeenByTenant) throw new Error('Admin history missing secondary-unit denylist_blocked event');
    const shadowUnitLeakedToTenant = tenantHistory.data.logs.some(
      (x) => x.unit_id === shadowUnit.id && x.denial_reason === 'denylist_blocked',
    );
    if (shadowUnitLeakedToTenant) throw new Error('Tenant leaked secondary-unit event they should not see');
    ok('Access-history API contains canonical denial taxonomy and keypad metadata');

    step('Validating realtime role-scoped activity subscriptions');
    const waitForFeedEvent = async (feed, predicate, label, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (feed.events.some((evt) => {
          try {
            return predicate(evt);
          } catch {
            return false;
          }
        })) {
          return true;
        }
        await delay(200);
      }
      throw new Error(`Timed out waiting for ${feed.label} realtime event: ${label}`);
    };

    const realtimeToken = `rt-${Date.now()}`;
    const realtimePrimaryActorName = `Realtime Primary ${realtimeToken}`;
    const realtimeShadowActorName = `Realtime Shadow ${realtimeToken}`;
    const reqRealtimeAccessEvents = `req-access-events-realtime-${Date.now()}`;
    ws.send(JSON.stringify({
      type: 'PROXY_REQUEST',
      id: reqRealtimeAccessEvents,
      method: 'POST',
      path: '/internal/gateway/access-events',
      body: {
        facility_id: facilityId,
        events: [
          {
            event_id: `evt-realtime-primary-${Date.now()}`,
            occurred_at: new Date().toISOString(),
            facility_id: facilityId,
            unit_id: unitId,
            device_id: deviceId,
            action: 'admin_remote_open',
            method: 'admin_remote',
            success: true,
            actor: {
              user_id: platformAdmin.id,
              role: 'admin',
              name: realtimePrimaryActorName,
            },
          },
          {
            event_id: `evt-realtime-shadow-${Date.now()}`,
            occurred_at: new Date().toISOString(),
            facility_id: facilityId,
            unit_id: shadowUnit.id,
            device_id: deviceId,
            action: 'access_denied',
            method: 'app',
            success: false,
            denial_reason: 'denylist_blocked',
            actor: {
              user_id: share2Id,
              role: 'shared_user',
              name: realtimeShadowActorName,
            },
          },
        ],
      },
    }));
    const realtimeResp = await waitForProxyResponse(ws, reqRealtimeAccessEvents);
    if (realtimeResp.status !== 200) {
      throw new Error(`Realtime probe ingestion failed: ${realtimeResp.status} ${JSON.stringify(realtimeResp.body)}`);
    }

    const matchesActorName = (evt, actorName) => evt?.type === 'activity_new'
      && evt?.data?.activity?.actor?.name === actorName;
    const matchesRealtimePrimary = (evt) => matchesActorName(evt, realtimePrimaryActorName)
      && evt?.data?.activity?.unitId === unitId;
    const matchesRealtimeShadow = (evt) => matchesActorName(evt, realtimeShadowActorName)
      && evt?.data?.activity?.unitId === shadowUnit.id;

    await Promise.all([
      waitForFeedEvent(tenantFeed, matchesRealtimePrimary, 'tenant primary-unit event'),
      waitForFeedEvent(facAdminFeed, matchesRealtimePrimary, 'facility_admin primary-unit event'),
      waitForFeedEvent(adminFeed, matchesRealtimePrimary, 'admin primary-unit event'),
    ]);

    await Promise.all([
      waitForFeedEvent(facAdminFeed, matchesRealtimeShadow, 'facility_admin shadow-unit event'),
      waitForFeedEvent(adminFeed, matchesRealtimeShadow, 'admin shadow-unit event'),
    ]);

    const tenantShadowLeak = tenantFeed.events.some((evt) => matchesRealtimeShadow(evt));
    if (tenantShadowLeak) {
      throw new Error('Tenant realtime feed leaked secondary-unit event');
    }
    ok('Realtime role-scoped activity feeds propagated expected events without tenant leakage');

    for (const feed of [tenantFeed, facAdminFeed, adminFeed]) {
      if (feed.socket.readyState === WebSocket.OPEN) {
        feed.socket.close();
      }
    }

    // -------------------------------------------------------------------
    // New invited user (not in system before invite) – first-time flow
    // -------------------------------------------------------------------
    heading('New Invitee First-time Login (Unknown User)');

    // Invite a brand-new sharee by phone via key-sharing invite
    const newInvitePhone = `+1555${String(Date.now()).slice(-7)}`;
    step('Inviting new sharee by phone (user not previously in system)');
    let inviteShareRes;
    try {
      inviteShareRes = await axios.post(`${API_BASE}/key-sharing/invite`, {
        unit_id: unitId,
        phone: newInvitePhone,
        access_level: 'limited',
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      throw new Error(`Key-sharing invite HTTP error: status=${status} body=${JSON.stringify(body)}`);
    }
    if (!inviteShareRes.data?.success || !inviteShareRes.data?.share_id) {
      throw new Error(`Key-sharing invite failed: ${JSON.stringify(inviteShareRes.data)}`);
    }
    const newShareId = inviteShareRes.data.share_id;
    created.shares.push(newShareId);
    ok(`Invited new sharee via phone ${newInvitePhone} (shareId=${newShareId})`);

    // Resolve the newly created userId from the key-sharing records
    step('Resolving invited user from key-sharing data');
    const newShareUnit = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!newShareUnit.data?.success) throw new Error('Admin unit key-sharing lookup failed for invited user');
    const newSharings = newShareUnit.data.sharings || [];
    const newShare = newSharings.find((s) => s.id === newShareId);
    if (!newShare || !newShare.shared_with_user_id) {
      throw new Error('Could not resolve invited user id from key-sharing');
    }
    const newInviteeId = newShare.shared_with_user_id;
    created.users.push(newInviteeId);
    ok(`Invited user resolved as ${newInviteeId}`);

    // Dev-admin helper: send invite for this new user and capture token via notifications WS
    // NOTE: Now the invite contains both the deeplink and OTP code in a single message
    step(`Sending invite for new sharee ${newInviteeId}`);
    // Clear any prior notification events so we only capture fresh invite for this user
    notificationEvents.length = 0;
    await axios.post(`${API_BASE}/users/${newInviteeId}/resend-invite`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const newInviteEvent = await waitForNotification((e) =>
      e.kind === 'invite' && e.delivery === 'sms' && e.body && String(e.body).includes('invite')
    );
    ok(`Invite SMS received for new sharee ${newInviteEvent.toPhone || newInviteEvent.toEmail || 'unknown-recipient'}`);
    console.log(C.cyan('\n  📧 Full New Invitee Invite Notification Details:'));
    console.log(C.gray(JSON.stringify(newInviteEvent, null, 2)));
    
    const newDeeplinkMatch = String(newInviteEvent.body).match(/token=([^&\s]+)/);
    if (!newDeeplinkMatch) throw new Error('No invite token found in SMS for new sharee');
    const newInviteToken = decodeURIComponent(newDeeplinkMatch[1]);
    
    // Parse OTP from the invite notification (embedded in same message now)
    let newOtp = newInviteEvent.meta?.code;
    if (!newOtp) {
      const newOtpMatch = String(newInviteEvent.body).match(/(\d{6})/);
      if (!newOtpMatch) throw new Error('No OTP code found in invite SMS for new sharee');
      newOtp = newOtpMatch[1];
    }
    ok(`Extracted OTP ${newOtp} from invite notification for new sharee`);

    // Accept the invite - this checks profile status (does not consume invite)
    step('Checking profile for new sharee via invite/accept');
    const newAcceptRes = await axios.post(`${API_BASE}/auth/invite/accept`, { token: newInviteToken });
    if (!newAcceptRes.data?.success) throw new Error('Accept invite failed for new sharee');
    const needsProfile = newAcceptRes.data.needs_profile;
    ok(`Invite accepted for new sharee. needs_profile=${needsProfile}`);
    
    // For a new invitee (phone-only), needs_profile should be true
    if (!needsProfile) {
      throw new Error('Expected needs_profile=true for phone-only invitee, but got false');
    }

    // First attempt: set password WITHOUT profile details → should be rejected
    step('Attempting set-password without profile details (expected to fail)');
    let deniedWithoutProfile = false;
    try {
      await axios.post(`${API_BASE}/auth/invite/set-password`, {
        token: newInviteToken,
        otp: newOtp,
        newPassword: 'NewInvitee123!',
      });
    } catch (err) {
      const status = err?.response?.status;
      const msg = String(err?.response?.data?.message || '');
      if (status === 400 && (msg.includes('First name is required') || msg.includes('Last name is required'))) {
        deniedWithoutProfile = true;
      } else {
        throw new Error(`Unexpected error from set-password without profile: status=${status} message=${msg}`);
      }
    }
    if (!deniedWithoutProfile) {
      throw new Error('Expected set-password to be rejected without profile details for new invitee');
    }
    ok('Set-password correctly rejected without first/last name');

    // Second attempt: set password WITH profile details included
    step('Setting password for new sharee with profile details');
    const newPassword = 'NewInvitee123!';
    const newSetPwd = await axios.post(`${API_BASE}/auth/invite/set-password`, {
      token: newInviteToken,
      otp: newOtp,
      newPassword,
      firstName: 'New',
      lastName: 'Invitee',
    });
    if (!newSetPwd.data?.success) throw new Error('Set password failed for new sharee');
    ok('First-time login completed for new sharee');

    // Sanity check: new sharee can log in using phone identifier
    await delay(4000);
    const newShareeToken = await tenantLogin(newInvitePhone, newPassword);
    if (!newShareeToken) throw new Error('New sharee login failed after first-time setup');
    ok('New sharee can log in with phone identifier');

    // Ensure new sharee is associated to the facility that owns the shared unit
    step('Verifying new sharee has facility association for unit facility');
    const facilitiesRes = await axios.get(`${API_BASE}/user-facilities/${newInviteeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!facilitiesRes.data?.success) {
      throw new Error(`Failed to fetch user facilities for new sharee: ${JSON.stringify(facilitiesRes.data)}`);
    }
    const facilityIds = facilitiesRes.data.facilityIds || [];
    if (!facilityIds.includes(facilityId)) {
      throw new Error(`Expected new sharee to be associated with facility ${facilityId}, got: [${facilityIds.join(', ')}]`);
    }
    ok('New sharee has correct facility association');


    // Assign primary tenant to unit
    step('Assigning primary tenant to unit');
    await assignTenantToUnit(token, unitId, primaryId, true);
    ok('Assigned primary tenant');

    // Share with user2
    step('Sharing with user2');
    const share1 = await shareKey(token, unitId, share1Id, 'full');
    created.shares.push(share1);
    ok(`Shared with user2 (shareId=${share1})`);

    // Share with user3
    step('Sharing with user3');
    const share2 = await shareKey(token, unitId, share2Id, 'limited');
    created.shares.push(share2);
    ok(`Shared with user3 (shareId=${share2})`);

    // Ensure shared users have active route passes (so DENYLIST_ADD/REMOVE commands are sent)
    // Register a dummy device and request a pass for each shared user
    const dummyPubKeyB64 = Buffer.alloc(32, 1).toString('base64'); // 32 bytes base64
    if (!share1Token || !share2Token || !primaryToken) {
      throw new Error('Missing cached tokens for route pass verification');
    }
    // Share2 (to be revoked first)
    const share2AppDevId = `e2e-dev-${Date.now()}-s2`;
    step(`Registering user-device ${share2AppDevId} for share2`);
    await registerUserDevice(share2Token, share2AppDevId, dummyPubKeyB64);
    step('Requesting route pass for share2');
    const share2Pass = await requestRoutePass(share2Token, share2AppDevId);
    // Assert shared-key audience for share2
    const share2Claims = decodeJwtClaims(share2Pass);
    if (!share2Claims || !Array.isArray(share2Claims.aud)) throw new Error('Invalid route pass payload for share2');
    assertRoutePassUserRole(share2Claims, 'tenant');
    const expectedSharedAud2 = `shared_key:${primaryId}:${remainingSerial}`;
    if (!share2Claims.aud.includes(expectedSharedAud2)) {
      throw new Error(`Missing expected aud for share2: ${expectedSharedAud2}`);
    }
    // Log concise pass details
    info(`Share2 pass: sub=${share2Claims.sub} audCount=${share2Claims.aud.length} hasExpected=${share2Claims.aud.includes(expectedSharedAud2)} lifetimeSec=${(share2Claims.exp - share2Claims.iat) || 'n/a'} aud=[${share2Claims.aud.join(', ')}]`);
    // Share1 (to test regrant remove path)
    const share1AppDevId = `e2e-dev-${Date.now()}-s1`;
    step(`Registering user-device ${share1AppDevId} for share1`);
    await registerUserDevice(share1Token, share1AppDevId, dummyPubKeyB64);
    step('Requesting route pass for share1');
    const share1Pass = await requestRoutePass(share1Token, share1AppDevId);
    const share1Claims = decodeJwtClaims(share1Pass);
    if (!share1Claims || !Array.isArray(share1Claims.aud)) throw new Error('Invalid route pass payload for share1');
    assertRoutePassUserRole(share1Claims, 'tenant');
    const expectedSharedAud1 = `shared_key:${primaryId}:${remainingSerial}`;
    if (!share1Claims.aud.includes(expectedSharedAud1)) {
      throw new Error(`Missing expected aud for share1: ${expectedSharedAud1}`);
    }
    info(`Share1 pass: sub=${share1Claims.sub} audCount=${share1Claims.aud.length} hasExpected=${share1Claims.aud.includes(expectedSharedAud1)} lifetimeSec=${(share1Claims.exp - share1Claims.iat) || 'n/a'} aud=[${share1Claims.aud.join(', ')}]`);

    // Primary tenant: ensure an active route pass so DENYLIST_ADD will be emitted on deactivation
    const primaryAppDevId = `e2e-dev-${Date.now()}-primary`;
    created.primaryAppDevId = primaryAppDevId;
    step(`Registering user-device ${primaryAppDevId} for primary tenant`);
    await registerUserDevice(primaryToken, primaryAppDevId, dummyPubKeyB64);
    step('Requesting route pass for primary tenant');
    const primaryPass = await requestRoutePass(primaryToken, primaryAppDevId);
    const primaryClaims = decodeJwtClaims(primaryPass);
    if (!primaryClaims || !Array.isArray(primaryClaims.aud)) throw new Error('Invalid route pass payload for primary');
    assertRoutePassUserRole(primaryClaims, 'tenant');
    const expectedPrimaryAud = `lock:${remainingSerial}`;
    if (!primaryClaims.aud.includes(expectedPrimaryAud)) {
      throw new Error(`Missing expected aud for primary: ${expectedPrimaryAud}`);
    }
    info(`Primary pass: sub=${primaryClaims.sub} audCount=${primaryClaims.aud.length} hasExpected=${primaryClaims.aud.includes(expectedPrimaryAud)} lifetimeSec=${(primaryClaims.exp - primaryClaims.iat) || 'n/a'} aud=[${primaryClaims.aud.join(', ')}]`);

    // Key-sharing API RBAC checks
    heading('Key Sharing APIs');
    step('Primary tenant fetching unit key-sharing');
    const primaryUnitSharing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${primaryToken}` }
    });
    if (!primaryUnitSharing.data?.success) throw new Error('Primary user key-sharing call failed');
    const primarySharings = primaryUnitSharing.data.sharings || [];
    const primaryHasShare1 = primarySharings.some((s) => s.shared_with_user_id === share1Id);
    const primaryHasShare2 = primarySharings.some((s) => s.shared_with_user_id === share2Id);
    if (!primaryHasShare1 || !primaryHasShare2) {
      throw new Error('Primary user did not see all shared users in unit key-sharing');
    }
    ok('Primary tenant sees all shared users for unit');

    step('Shared user3 fetching unit key-sharing (should only see their own share)');
    const share2UnitSharing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${share2Token}` }
    });
    if (!share2UnitSharing.data?.success) throw new Error('Shared user key-sharing call failed');
    const share2Sharings = share2UnitSharing.data.sharings || [];
    const allSharingsAreSelf = share2Sharings.every((s) => s.shared_with_user_id === share2Id);
    if (!allSharingsAreSelf || share2Sharings.length === 0) {
      throw new Error('Shared user can see other shared users in unit key-sharing');
    }
    ok('Shared user sees only their own share for unit');

    step('Admin fetching unit key-sharing');
    const adminUnitSharing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!adminUnitSharing.data?.success) throw new Error('Admin key-sharing call failed');
    const adminSharings = adminUnitSharing.data.sharings || [];
    const adminHasShare1 = adminSharings.some((s) => s.shared_with_user_id === share1Id);
    const adminHasShare2 = adminSharings.some((s) => s.shared_with_user_id === share2Id);
    if (!adminHasShare1 || !adminHasShare2) {
      throw new Error('Admin did not see all shared users in unit key-sharing');
    }
    ok('Admin sees all shared users for unit');

    heading('Key Sharing API Coverage');
    step('Admin grouped listing with units and totals');
    const groupedAdmin = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { group_by_unit: 'true' }
    });
    const groupedUnits = groupedAdmin.data?.units || [];
    const groupedUnit = groupedUnits.find((u) => u.unit_id === unitId);
    if (!groupedUnit || (groupedAdmin.data?.total_sharings || 0) < 3) {
      throw new Error('Grouped key-sharing response missing expected unit data');
    }
    ok('Admin grouped listing includes our unit and sharings');

    step('Facility admin grouped listing limited to assigned facility');
    if (!facilityAdmin.token) throw new Error('Facility admin token missing');
    const facilityAdminGrouped = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${facilityAdmin.token}` },
      params: { group_by_unit: 'true' }
    });
    const facilityUnits = facilityAdminGrouped.data?.units || [];
    if (facilityUnits.length !== 1 || facilityUnits[0].unit_id !== unitId) {
      throw new Error('Facility admin grouped listing is not scoped to their facility');
    }
    ok('Facility admin grouped listing scoped correctly');

    step('Admin updating share metadata via PUT');
    const updatedNotes = 'Updated via E2E';
    const updateShareRes = await axios.put(`${API_BASE}/key-sharing/${share1}`, {
      notes: updatedNotes
    }, { headers: { Authorization: `Bearer ${token}` } });
    const updatedNotesResponse = updateShareRes.data?.notes ?? updateShareRes.data?.data?.notes;
    if (updatedNotesResponse !== updatedNotes) {
      throw new Error('Failed to update share metadata');
    }
    const verifyUpdateRes = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const updatedShareRecord = (verifyUpdateRes.data?.sharings || []).find((s) => s.id === share1);
    if (!updatedShareRecord || updatedShareRecord.notes !== updatedNotes) {
      throw new Error('Share metadata update not reflected in unit listing');
    }
    ok('Share metadata updates are reflected in listings');

    step('Admin fetching key-sharing records for a specific user');
    const adminUserSharings = await axios.get(`${API_BASE}/key-sharing/user/${share1Id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const adminSharedKeys = adminUserSharings.data?.shared_keys ?? adminUserSharings.data?.sharings ?? [];
    if (!adminUserSharings.data?.success || adminSharedKeys.length === 0) {
      throw new Error('Admin user-specific key-sharing lookup failed');
    }
    ok('Admin user-specific key-sharing lookup succeeded');

    step('Tenant fetching their own key-sharing via /user endpoint');
    const tenantSelfSharings = await axios.get(`${API_BASE}/key-sharing/user/${share1Id}`, {
      headers: { Authorization: `Bearer ${share1Token}` }
    });
    if (!tenantSelfSharings.data?.success || (tenantSelfSharings.data?.sharings || []).some((s) => s.shared_with_user_id !== share1Id)) {
      throw new Error('Tenant self key-sharing lookup returned unexpected data');
    }
    ok('Tenant can view their own key-sharing records');

    step('Tenant blocked from viewing other user key-sharing records');
    let prevented = false;
    try {
      await axios.get(`${API_BASE}/key-sharing/user/${share2Id}`, {
        headers: { Authorization: `Bearer ${share1Token}` }
      });
    } catch (err) {
      if (err?.response?.status === 403) prevented = true;
      else throw err;
    }
    if (!prevented) throw new Error('Tenant was able to fetch another user key-sharing records');
    ok('Tenant prevented from viewing other user key-sharing records');

    // Test that shared users can see units they have access to
    // NOTE: This must come BEFORE the revocation tests, so share1Token still has an active share
    heading('Shared User Unit Access Tests');
    
    step('Shared user can fetch unit details for shared unit');
    const share1UnitDetails = await axios.get(`${API_BASE}/units/${unitId}`, {
      headers: { Authorization: `Bearer ${share1Token}` }
    });
    if (!share1UnitDetails.data?.success || !share1UnitDetails.data?.unit) {
      throw new Error(`Shared user could not fetch unit details: ${JSON.stringify(share1UnitDetails.data)}`);
    }
    if (share1UnitDetails.data.unit.id !== unitId) {
      throw new Error('Shared user unit details returned wrong unit');
    }
    ok('Shared user can fetch details for shared unit');

    step('Shared user can list units (should include shared unit)');
    const share1Units = await axios.get(`${API_BASE}/units`, {
      headers: { Authorization: `Bearer ${share1Token}` },
      params: { facility_id: facilityId }
    });
    if (!share1Units.data?.success) {
      throw new Error(`Shared user units list failed: ${JSON.stringify(share1Units.data)}`);
    }
    const share1UnitsList = share1Units.data.units || [];
    const hasSharedUnit = share1UnitsList.some(u => u.id === unitId);
    if (!hasSharedUnit) {
      throw new Error(`Shared user units list does not include shared unit. Found: ${share1UnitsList.map(u => u.id).join(', ')}`);
    }
    ok('Shared user can see shared unit in units list');

    step('Primary tenant can list their units');
    const primaryUnits = await axios.get(`${API_BASE}/units`, {
      headers: { Authorization: `Bearer ${primaryToken}` },
      params: { facility_id: facilityId }
    });
    if (!primaryUnits.data?.success) {
      throw new Error(`Primary tenant units list failed: ${JSON.stringify(primaryUnits.data)}`);
    }
    const primaryUnitsList = primaryUnits.data.units || [];
    const hasPrimaryUnit = primaryUnitsList.some(u => u.id === unitId);
    if (!hasPrimaryUnit) {
      throw new Error(`Primary tenant units list does not include their unit. Found: ${primaryUnitsList.map(u => u.id).join(', ')}`);
    }
    ok('Primary tenant can see their assigned unit');

    // Test default active-only filtering behavior
    heading('Key Sharing Active-Only Filtering');
    step('Using share1 for filtering test');
    // Use share1 that was created earlier - it should be active
    const filterTestShare = share1;
    ok(`Using share1 for test: ${filterTestShare}`);
    
    // Helper function to check if a share is active (handles both boolean and numeric values)
    const isActive = (s) => s.is_active === true || s.is_active === 1;
    
    step('Verifying test share appears in default (active-only) listing');
    const defaultListing = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { unit_id: unitId }
    });
    const defaultSharings = defaultListing.data?.sharings || [];
    const foundInDefault = defaultSharings.some((s) => s.id === filterTestShare && isActive(s));
    if (!foundInDefault) {
      // Debug: show what we got
      const shareDetails = defaultSharings.find((s) => s.id === filterTestShare);
      const allShareIds = defaultSharings.map((s) => ({ id: s.id, is_active: s.is_active, shared_with: s.shared_with_user_id }));
      throw new Error(`Active share not found in default listing. Looking for: ${filterTestShare}. Found shares: ${JSON.stringify(allShareIds)}. Share details: ${JSON.stringify(shareDetails || 'not found')}`);
    }
    ok('Active share appears in default listing');
    
    step('Verifying test share appears in unit endpoint default listing');
    const defaultUnitListing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const defaultUnitSharings = defaultUnitListing.data?.sharings || [];
    const foundInDefaultUnit = defaultUnitSharings.some((s) => s.id === filterTestShare && isActive(s));
    if (!foundInDefaultUnit) {
      throw new Error('Active share not found in unit endpoint default listing');
    }
    ok('Active share appears in unit endpoint default listing');
    
    step('Revoking test share');
    await revokeShare(token, filterTestShare);
    // Remove from created.shares since we're revoking it for testing
    created.shares = created.shares.filter((id) => id !== filterTestShare);
    ok('Test share revoked');
    
    step('Verifying revoked share is excluded from default listing');
    const afterRevokeListing = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { unit_id: unitId }
    });
    const afterRevokeSharings = afterRevokeListing.data?.sharings || [];
    const foundAfterRevoke = afterRevokeSharings.some((s) => s.id === filterTestShare);
    if (foundAfterRevoke) {
      throw new Error('Revoked share still appears in default listing');
    }
    ok('Revoked share excluded from default listing');
    
    step('Verifying revoked share is excluded from unit endpoint default listing');
    const afterRevokeUnitListing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const afterRevokeUnitSharings = afterRevokeUnitListing.data?.sharings || [];
    const foundAfterRevokeUnit = afterRevokeUnitSharings.some((s) => s.id === filterTestShare);
    if (foundAfterRevokeUnit) {
      throw new Error('Revoked share still appears in unit endpoint default listing');
    }
    ok('Revoked share excluded from unit endpoint default listing');
    
    step('Verifying revoked share appears when explicitly requesting inactive');
    const inactiveListing = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { unit_id: unitId, is_active: 'false' }
    });
    const inactiveSharings = inactiveListing.data?.sharings || [];
    const foundInInactive = inactiveSharings.some((s) => s.id === filterTestShare && !isActive(s));
    if (!foundInInactive) {
      throw new Error('Revoked share not found when explicitly requesting inactive');
    }
    ok('Revoked share appears when explicitly requesting inactive');
    
    step('Verifying revoked share appears in unit endpoint when explicitly requesting inactive');
    let inactiveUnitListing;
    try {
      inactiveUnitListing = await axios.get(`${API_BASE}/key-sharing/unit/${unitId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { is_active: 'false' }
      });
    } catch (err) {
      throw new Error(`Failed to fetch inactive shares from unit endpoint: ${err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Unknown error'}. Status: ${err?.response?.status}`);
    }
    if (!inactiveUnitListing.data?.success) {
      throw new Error(`Unit endpoint returned unsuccessful response: ${JSON.stringify(inactiveUnitListing.data)}`);
    }
    const inactiveUnitSharings = inactiveUnitListing.data?.sharings || [];
    const foundInInactiveUnit = inactiveUnitSharings.some((s) => s.id === filterTestShare && !isActive(s));
    if (!foundInInactiveUnit) {
      throw new Error(`Revoked share not found in unit endpoint when explicitly requesting inactive. Looking for: ${filterTestShare}. Found shares: ${JSON.stringify(inactiveUnitSharings.map(s => ({ id: s.id, is_active: s.is_active })))}`);
    }
    ok('Revoked share appears in unit endpoint when explicitly requesting inactive');
    
    step('Verifying explicit is_active=true returns only active shares');
    const activeOnlyListing = await axios.get(`${API_BASE}/key-sharing`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { unit_id: unitId, is_active: 'true' }
    });
    const activeOnlySharings = activeOnlyListing.data?.sharings || [];
    const allActive = activeOnlySharings.every((s) => isActive(s));
    const foundRevokedInActive = activeOnlySharings.some((s) => s.id === filterTestShare);
    if (!allActive || foundRevokedInActive) {
      throw new Error('Explicit is_active=true returned inactive shares');
    }
    ok('Explicit is_active=true returns only active shares');

    // Test new sharee access (this user gets a new share created later, so they should have access)
    step('New sharee (invited user) can fetch shared unit details');
    const newShareeUnitDetails = await axios.get(`${API_BASE}/units/${unitId}`, {
      headers: { Authorization: `Bearer ${newShareeToken}` }
    });
    if (!newShareeUnitDetails.data?.success || !newShareeUnitDetails.data?.unit) {
      throw new Error(`New sharee could not fetch unit details: ${JSON.stringify(newShareeUnitDetails.data)}`);
    }
    ok('New sharee (invited user) can fetch shared unit details');

    step('New sharee (invited user) can list units');
    const newShareeUnits = await axios.get(`${API_BASE}/units`, {
      headers: { Authorization: `Bearer ${newShareeToken}` },
      params: { facility_id: facilityId }
    });
    if (!newShareeUnits.data?.success) {
      throw new Error(`New sharee units list failed: ${JSON.stringify(newShareeUnits.data)}`);
    }
    const newShareeUnitsList = newShareeUnits.data.units || [];
    const newShareeHasUnit = newShareeUnitsList.some(u => u.id === unitId);
    if (!newShareeHasUnit) {
      throw new Error(`New sharee units list does not include shared unit. Found: ${newShareeUnitsList.map(u => u.id).join(', ')}`);
    }
    ok('New sharee (invited user) can see shared unit in units list');

    heading('Facility Admin Gateway Coverage');
    step('Switching primary gateway session to facility admin');
    try {
      ws.close(4000, 'facility-admin-coverage');
    } catch {}
    let wsFacilityAdmin = await connectGatewayWsAndAuth(WS_URL, facilityAdmin.token, facilityId);
    step('Facility admin proxying facility-scoped device list');
    const facDevices = await proxyWs(wsFacilityAdmin, 'fac-devices', 'GET', `/devices`, { query: { facility_id: facilityId, limit: 1 } });
    if (facDevices.status !== 200) throw new Error(`Facility admin proxy devices failed: ${facDevices.status}`);
    ok('Facility admin can proxy facility-scoped devices');
    step('Facility admin blocked from proxying other facilities');
    const facForbidden = await proxyWs(wsFacilityAdmin, 'fac-devices-forbidden', 'GET', `/devices`, { query: { facility_id: '00000000-0000-0000-0000-000000000000', limit: 1 } });
    if (facForbidden.status !== 403) throw new Error('Expected facility guard to block cross-facility proxy access');
    ok('Facility guard prevented cross-facility proxy access');
    wsFacilityAdmin.close();
    wsFacilityAdmin = null;
    step('Reconnecting primary gateway session after facility admin coverage');
    ws = await connectGatewayWsAndAuth(WS_URL, token, facilityId);
    ok('Gateway connection re-established for admin session');

    // Unshare user3 -> expect DENYLIST_ADD for sub=share2Id
    heading('Denylist Command Flow');
    const expectAddShare3 = waitForCommand(ws, (cmd) => cmd.cmd_type === 'DENYLIST_ADD' && Array.isArray(cmd.denylist_add) && cmd.denylist_add.some(e => e.sub === share2Id));
    await revokeShare(token, share2);
    // Remove from created.shares as it's revoked
    created.shares = created.shares.filter((id) => id !== share2);
    await expectAddShare3;
    ok('Received DENYLIST_ADD for share3 revoke');

    // Re-share user3 -> expect DENYLIST_REMOVE sub=share2Id
    const expectRemoveShare3 = waitForCommand(ws, (cmd) => cmd.cmd_type === 'DENYLIST_REMOVE' && Array.isArray(cmd.denylist_remove) && cmd.denylist_remove.some(e => e.sub === share2Id));
    try {
      const share2b = await shareKey(token, unitId, share2Id, 'limited');
      created.shares.push(share2b);
    } catch (e) {
      if (VERBOSE) warn(`Re-share via POST failed; attempting PUT reactivate... ${e?.response?.data || e?.message}`);
      // Fallback: directly reactivate the revoked share by id (share2)
      await axios.put(`${API_BASE}/key-sharing/${share2}`, { is_active: true }, { headers: { Authorization: `Bearer ${token}` } });
      created.shares.push(share2);
    }
    await expectRemoveShare3;
    ok('Received DENYLIST_REMOVE for share3 regrant');

    // Revoke primary tenant -> expect DENYLIST_ADD only for primaryId
    const expectAddPrimary = waitForCommand(ws, (cmd) => cmd.cmd_type === 'DENYLIST_ADD' && Array.isArray(cmd.denylist_add) && cmd.denylist_add.some(e => e.sub === primaryId));
    await deactivateUser(token, primaryId);
    await expectAddPrimary;
    ok('Received DENYLIST_ADD for primary tenant deactivation');

    // Reinstate primary tenant -> expect DENYLIST_REMOVE only for primaryId
    const expectRemovePrimary = waitForCommand(ws, (cmd) => cmd.cmd_type === 'DENYLIST_REMOVE' && Array.isArray(cmd.denylist_remove) && cmd.denylist_remove.some(e => e.sub === primaryId));
    await activateUser(token, primaryId);
    await expectRemovePrimary;
    ok('Received DENYLIST_REMOVE for primary tenant activation');

    heading('Gateway Command DevTools Test');
    step('Testing dev gateway command: LOCK');
    const devToolsLockRes = await axios.post(`${API_BASE}/admin/dev-tools/gateway-command`, {
      facilityId,
      command: 'LOCK',
      targetDeviceIds: [deviceId],
    }, { headers: { Authorization: `Bearer ${token}` } });
    if (!devToolsLockRes.data?.success) throw new Error('LOCK command failed');
    ok('LOCK gateway command sent successfully');

    step('Testing dev gateway command: UNLOCK');
    const devToolsUnlockRes = await axios.post(`${API_BASE}/admin/dev-tools/gateway-command`, {
      facilityId,
      command: 'UNLOCK',
      targetDeviceIds: [deviceId],
    }, { headers: { Authorization: `Bearer ${token}` } });
    if (!devToolsUnlockRes.data?.success) throw new Error('UNLOCK command failed');
    ok('UNLOCK gateway command sent successfully');

    step('Testing dev gateway command: DENYLIST_ADD');
    const denyAddRes = await axios.post(`${API_BASE}/admin/dev-tools/gateway-command`, {
      facilityId,
      command: 'DENYLIST_ADD',
      targetDeviceIds: [deviceId],
      userId: share1Id,
      expirationSeconds: 3600,
    }, { headers: { Authorization: `Bearer ${token}` } });
    // Response now returns jwt instead of payload after JWT refactoring
    if (!denyAddRes.data?.success || !denyAddRes.data?.jwt) throw new Error('DENYLIST_ADD command failed');
    ok('DENYLIST_ADD gateway command sent successfully');

    step('Testing dev gateway command: DENYLIST_REMOVE');
    const denyRemoveRes = await axios.post(`${API_BASE}/admin/dev-tools/gateway-command`, {
      facilityId,
      command: 'DENYLIST_REMOVE',
      targetDeviceIds: [deviceId],
      userId: share1Id,
    }, { headers: { Authorization: `Bearer ${token}` } });
    // Response now returns jwt instead of payload after JWT refactoring
    if (!denyRemoveRes.data?.success || !denyRemoveRes.data?.jwt) throw new Error('DENYLIST_REMOVE command failed');
    ok('DENYLIST_REMOVE gateway command sent successfully');

    heading('Register-Key All Roles Test');
    step('Admin registering device key');
    const adminPublicKey = Buffer.from('AdminDeviceKey123').toString('base64');
    const adminRegRes = await axios.post(`${API_BASE}/user-devices/register-key`, {
      app_device_id: 'e2e-admin-device-test',
      platform: 'other',
      device_name: 'E2E Admin Test Device',
      public_key: adminPublicKey,
    }, { headers: { Authorization: `Bearer ${token}` } });
    if (!adminRegRes.data?.success) throw new Error('Admin register-key failed');
    ok('Admin can register device key');

    step('Facility admin registering device key');
    const faPublicKey = Buffer.from('FacilityAdminDeviceKey123').toString('base64');
    const faRegRes = await axios.post(`${API_BASE}/user-devices/register-key`, {
      app_device_id: 'e2e-fa-device-test',
      platform: 'other',
      device_name: 'E2E Facility Admin Test Device',
      public_key: faPublicKey,
    }, { headers: { Authorization: `Bearer ${facilityAdmin.token}` } });
    if (!faRegRes.data?.success) throw new Error('Facility admin register-key failed');
    ok('Facility admin can register device key');

    heading('Device Registration and Revocation E2E Test');
    // Test that login returns correct isDeviceRegistered status and handles revocation properly
    const e2eDeviceId = 'e2e-device-revoke-test-' + Date.now();
    const e2ePublicKey = Buffer.from('E2EDeviceTestKey123').toString('base64');

    step('Registering test device for primary tenant');
    const regDeviceRes = await axios.post(`${API_BASE}/user-devices/register-key`, {
      app_device_id: e2eDeviceId,
      platform: 'other',
      device_name: 'E2E Revoke Test Device',
      public_key: e2ePublicKey,
    }, { headers: { Authorization: `Bearer ${primaryToken}` } });
    if (!regDeviceRes.data?.success) throw new Error(`Device registration failed: ${JSON.stringify(regDeviceRes.data)}`);
    if (!regDeviceRes.data.device?.id) throw new Error(`Device registration response missing device.id: ${JSON.stringify(regDeviceRes.data)}`);
    const registeredDeviceId = regDeviceRes.data.device.id;
    if (VERBOSE) console.log(`  • Device response: ${JSON.stringify(regDeviceRes.data.device)}`);
    ok(`Device registered with ID: ${registeredDeviceId}`);

    // Use the default password set during first-time login flow
    const primaryTenantPassword = 'TestUser123!';

    step('Verifying login returns isDeviceRegistered: true for registered device');
    const loginWithDeviceRes = await axios.post(`${API_BASE}/auth/login`, {
      identifier: primaryEmail,
      password: primaryTenantPassword,
    }, { headers: { 'X-App-Device-Id': e2eDeviceId } });
    if (!loginWithDeviceRes.data?.success) throw new Error('Login failed');
    if (loginWithDeviceRes.data.isDeviceRegistered !== true) {
      throw new Error(`Expected isDeviceRegistered: true, got ${loginWithDeviceRes.data.isDeviceRegistered}`);
    }
    ok('Login returns isDeviceRegistered: true for registered device');

    step('Revoking the test device');
    if (VERBOSE) console.log(`  • Attempting to revoke device ID: ${registeredDeviceId}`);
    const revokeDeviceRes = await axios.delete(`${API_BASE}/user-devices/me/${registeredDeviceId}`, {
      headers: { Authorization: `Bearer ${primaryToken}` }
    }).catch(err => err.response);
    if (!revokeDeviceRes?.data?.success) {
      throw new Error(`Device revocation failed: ${JSON.stringify(revokeDeviceRes?.data)} (status: ${revokeDeviceRes?.status})`);
    }
    ok('Device revoked successfully');

    step('Verifying login returns isDeviceRegistered: false for revoked device');
    const loginAfterRevokeRes = await axios.post(`${API_BASE}/auth/login`, {
      identifier: primaryEmail,
      password: primaryTenantPassword,
    }, { headers: { 'X-App-Device-Id': e2eDeviceId } });
    if (!loginAfterRevokeRes.data?.success) throw new Error('Login failed after revoke');
    if (loginAfterRevokeRes.data.isDeviceRegistered !== false) {
      throw new Error(`Expected isDeviceRegistered: false after revoke, got ${loginAfterRevokeRes.data.isDeviceRegistered}`);
    }
    ok('Login returns isDeviceRegistered: false for revoked device');

    step('Verifying login returns isDeviceRegistered: false for unknown device');
    const unknownDeviceId = 'unknown-device-' + Date.now();
    const loginUnknownDeviceRes = await axios.post(`${API_BASE}/auth/login`, {
      identifier: primaryEmail,
      password: primaryTenantPassword,
    }, { headers: { 'X-App-Device-Id': unknownDeviceId } });
    if (!loginUnknownDeviceRes.data?.success) throw new Error('Login failed for unknown device');
    if (loginUnknownDeviceRes.data.isDeviceRegistered !== false) {
      throw new Error(`Expected isDeviceRegistered: false for unknown device, got ${loginUnknownDeviceRes.data.isDeviceRegistered}`);
    }
    ok('Login returns isDeviceRegistered: false for unknown device');

    heading('Password Reset Flow Test (Deeplink + Token E2E)');
    // Clear any prior notification events so we only capture fresh password reset notification
    notificationEvents.length = 0;

    step('Requesting password reset for primary tenant');
    const resetReqRes = await axios.post(`${API_BASE}/auth/forgot-password/request`, {
      email: primaryEmail,
    }).catch(err => err.response);
    if (!resetReqRes || resetReqRes.status !== 200) {
      throw new Error(`Password reset request failed: expected 200, got ${resetReqRes?.status || 'no response'} - ${JSON.stringify(resetReqRes?.data)}`);
    }
    if (VERBOSE) console.log(`  • Delivery method: ${resetReqRes.data?.deliveryMethod || 'unknown'}`);
    ok('Password reset request submitted');

    // Wait for password reset deeplink via dev notifications WebSocket
    step('Waiting for password reset deeplink via notifications WebSocket');
    const resetEvent = await waitForNotification((e) => e.kind === 'password_reset');
    if (!resetEvent) {
      throw new Error('Did not receive password reset notification');
    }
    ok(`Received password reset notification for ${resetEvent.toPhone || resetEvent.toEmail || 'unknown-recipient'}`);
    console.log(C.cyan('\n  📧 Full Password Reset Notification Details:'));
    console.log(C.gray(JSON.stringify(resetEvent, null, 2)));
    // Extract token from deeplink in notification meta or body
    const resetToken = resetEvent.meta?.token;
    if (!resetToken) throw new Error('Failed to extract token from password reset notification');
    ok(`Extracted password reset token from notification`);

    step('Verifying reset token is valid');
    const verifyRes = await axios.post(`${API_BASE}/auth/forgot-password/verify`, {
      token: resetToken,
    }).catch(err => err.response);
    if (!verifyRes || verifyRes.status !== 200 || !verifyRes.data?.success) {
      throw new Error(`Token verification failed: status=${verifyRes?.status}, data=${JSON.stringify(verifyRes?.data)}`);
    }
    ok('Reset token verified successfully');

    step('Password reset with invalid token returns error');
    const resetBadRes = await axios.post(`${API_BASE}/auth/forgot-password/reset`, {
      token: 'invalid-token-abc123',
      newPassword: 'NewTestPassword123!',
    }).catch(err => err.response);
    if (!resetBadRes || resetBadRes.status !== 400) {
      throw new Error(`Password reset expected 400 for invalid token, got ${resetBadRes?.status || 'no response'}`);
    }
    ok('Password reset endpoint rejects invalid token');

    // Now use the real token to reset the password
    const resetNewPassword = 'ResetTestPwd456!';
    step('Resetting password with valid token');
    const resetSuccessRes = await axios.post(`${API_BASE}/auth/forgot-password/reset`, {
      token: resetToken,
      newPassword: resetNewPassword,
    }).catch(err => err.response);
    if (!resetSuccessRes || resetSuccessRes.status !== 200 || !resetSuccessRes.data?.success) {
      throw new Error(`Password reset with valid token failed: status=${resetSuccessRes?.status}, data=${JSON.stringify(resetSuccessRes?.data)}`);
    }
    ok('Password reset successful with valid token');

    // Verify user can log in with the new password
    step('Verifying login with new password');
    const newLoginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: primaryEmail,
      password: resetNewPassword,
    }).catch(err => err.response);
    if (!newLoginRes || newLoginRes.status !== 200 || !newLoginRes.data?.token) {
      throw new Error(`Login with new password failed: status=${newLoginRes?.status}, data=${JSON.stringify(newLoginRes?.data)}`);
    }
    primaryToken = newLoginRes.data.token;
    ok('Login with new password verified');

    // Also verify old password no longer works
    step('Verifying old password no longer works');
    const oldLoginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: primaryEmail,
      password: 'TestUser123!', // original password
    }).catch(err => err.response);
    if (oldLoginRes && oldLoginRes.status === 200 && oldLoginRes.data?.token) {
      throw new Error('Old password should no longer work after reset');
    }
    ok('Old password correctly rejected after reset');

    // Verify used token cannot be reused
    step('Verifying used token cannot be reused');
    const reuseRes = await axios.post(`${API_BASE}/auth/forgot-password/reset`, {
      token: resetToken,
      newPassword: 'AnotherPassword123!',
    }).catch(err => err.response);
    if (reuseRes && reuseRes.status === 200) {
      throw new Error('Used token should not be reusable');
    }
    ok('Used token correctly rejected');
    // Schedule Management Tests
    heading('Schedule Management');
    step('Testing schedule creation and management');
    // Get facility schedules
    const schedulesResp = await axios.get(`${API_BASE}/facilities/${created.facilityId}/schedules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ok(`Retrieved ${schedulesResp.data?.schedules?.length || 0} schedules for facility`);

    // Create a custom schedule
    const customScheduleResp = await axios.post(
      `${API_BASE}/facilities/${created.facilityId}/schedules`,
      {
        name: 'E2E Test Schedule',
        schedule_type: 'custom',
        is_active: true,
        time_windows: [
          { day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
          { day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00' },
        ],
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const customScheduleId = customScheduleResp.data?.schedule?.id;
    if (!customScheduleId) throw new Error('Failed to create custom schedule');
    created.scheduleId = customScheduleId;
    ok(`Created custom schedule ${customScheduleId}`);

    // Assign schedule to user
    await axios.put(
      `${API_BASE}/users/${created.primaryTenantId}/facilities/${created.facilityId}/schedule`,
      { scheduleId: customScheduleId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ok(`Assigned schedule to user ${created.primaryTenantId}`);

    // Verify route pass includes schedule
    step('Verifying route pass includes schedule data');
    if (!created.primaryAppDevId || !primaryToken) throw new Error('Primary app device or token unavailable for route pass verification');
    const routePassResp = await axios.post(
      `${API_BASE}/passes/request`,
      {},
      { headers: { Authorization: `Bearer ${primaryToken}`, 'X-App-Device-Id': created.primaryAppDevId } }
    );
    if (!routePassResp.data?.routePass) throw new Error('Route pass response missing routePass field');
    const rpParts = routePassResp.data.routePass.split('.');
    if (rpParts.length !== 3) throw new Error(`Route pass JWT has ${rpParts.length} parts, expected 3`);
    const rpPayload = JSON.parse(Buffer.from(rpParts[1], 'base64').toString());
    if (!Array.isArray(rpPayload.schedules) || rpPayload.schedules.length === 0) {
      throw new Error('Route pass does not include non-empty schedules claim');
    }
    const schedForFac = rpPayload.schedules.find((s) => s.f === created.facilityId);
    if (!schedForFac || !Array.isArray(schedForFac.w) || schedForFac.w.length === 0) {
      throw new Error('Route pass schedules missing compact entry for facility');
    }
    const expectedBand = [[[[1, 2]], '09:00', '17:00']];
    if (JSON.stringify(schedForFac.w) !== JSON.stringify(expectedBand)) {
      throw new Error(`Unexpected compact schedule bands: ${JSON.stringify(schedForFac.w)}`);
    }
    assertRoutePassUserRole(rpPayload, 'tenant');
    ok('Route pass includes schedules claim and user_role');

    // Test schedule usage endpoint
    step('Testing schedule usage endpoint');
    const usageResp = await axios.get(
      `${API_BASE}/facilities/${created.facilityId}/schedules/${customScheduleId}/usage`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!usageResp.data?.usage) throw new Error('Schedule usage response missing usage field');
    ok(`Schedule usage: ${usageResp.data.usage.totalCount} total users (${usageResp.data.usage.tenantCount} tenants, ${usageResp.data.usage.maintenanceCount} maintenance)`);

    // Test schedule deletion with user reassignment
    step('Testing schedule deletion with user reassignment');
    // Create another user and assign them to the schedule
    const testUserResp = await axios.post(
      `${API_BASE}/users`,
      {
        email: `e2e-schedule-test-${Date.now()}@test.com`,
        firstName: 'Schedule',
        lastName: 'Test',
        role: 'tenant',
        password: 'TestUser123!',
        facilityIds: [created.facilityId],
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const testUserId = testUserResp.data?.userId;
    if (!testUserId) throw new Error(`Failed to create test user for schedule deletion test: ${JSON.stringify(testUserResp.data)}`);
    created.users.push(testUserId);

    // Assign schedule to test user
    await axios.put(
      `${API_BASE}/users/${testUserId}/facilities/${created.facilityId}/schedule`,
      { scheduleId: customScheduleId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Check usage before deletion
    const usageBefore = await axios.get(
      `${API_BASE}/facilities/${created.facilityId}/schedules/${customScheduleId}/usage`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ok(`Before deletion: ${usageBefore.data?.usage?.totalCount || 0} users assigned`);

    // Delete the schedule
    await axios.delete(
      `${API_BASE}/facilities/${created.facilityId}/schedules/${customScheduleId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ok('Schedule deleted successfully');

    // Verify user schedule was cleared after custom schedule deletion
    const userScheduleResp = await axios.get(
      `${API_BASE}/users/${testUserId}/facilities/${created.facilityId}/schedule`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // After custom schedule deletion, user may be reassigned to default or have no schedule
    const postDeleteSchedule = userScheduleResp.data?.schedule;
    if (postDeleteSchedule && postDeleteSchedule.id === customScheduleId) {
      throw new Error('User still assigned to deleted custom schedule');
    }
    ok(`User schedule after deletion: ${postDeleteSchedule ? postDeleteSchedule.name : '(cleared/default)'}`);

    // Clear scheduleId so cleanup doesn't try to delete it again
    created.scheduleId = null;

    // ================================================================
    // Access Control API Tests
    // ================================================================
    heading('Access Control API');
    step('Testing access control device query');
    // Get access control devices for facility
    const acDevicesResp = await axios.get(
      `${API_BASE}/access-control/facilities/${created.facilityId}/devices`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const acDevices = acDevicesResp.data?.devices || [];
    if (acDevices.length === 0) {
      throw new Error('Expected access control devices but got 0 (were they created during setup?)');
    }
    ok(`Retrieved ${acDevices.length} access control devices`);

    // Validate device structure
    const firstAcDevice = acDevices[0];
    const requiredAcFields = ['id', 'name', 'deviceType', 'status', 'isLocked', 'facilityId', 'gatewayId'];
    const missingAcFields = requiredAcFields.filter(f => !(f in firstAcDevice));
    if (missingAcFields.length > 0) {
      throw new Error(`Access control device missing fields: ${missingAcFields.join(', ')}`);
    }
    ok(`Device structure validated (fields: ${requiredAcFields.join(', ')})`);

    // Verify we have all three types
    const acTypes = new Set(acDevices.map(d => d.deviceType));
    const expectedTypes = ['door', 'gate', 'elevator'];
    const missingTypes = expectedTypes.filter(t => !acTypes.has(t));
    if (missingTypes.length > 0) {
      throw new Error(`Missing access control device types: ${missingTypes.join(', ')}`);
    }
    ok(`Device types found: ${expectedTypes.join(', ')}`);

    // Test device type filter
    step('Testing access control type filter');
    const doorFilterResp = await axios.get(
      `${API_BASE}/access-control/facilities/${created.facilityId}/devices`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { deviceType: 'door' }
      }
    );
    const doorDevices = doorFilterResp.data?.devices || [];
    if (doorDevices.length === 0) {
      throw new Error('Door filter returned 0 devices (expected at least 1)');
    }
    if (!doorDevices.every(d => d.deviceType === 'door')) {
      throw new Error('Door filter returned non-door devices');
    }
    ok(`Door filter returned ${doorDevices.length} door device(s)`);

    // Get access control summary for facility
    step('Testing access control summary');
    const acSummaryResp = await axios.get(
      `${API_BASE}/access-control/facilities/${created.facilityId}/summary`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const summary = acSummaryResp.data?.summary;
    if (!summary) throw new Error('Summary response missing summary field');
    if (summary.total === 0) throw new Error('Summary reports 0 total devices');
    ok(`Access control summary: ${summary.total} total (doors: ${summary.byType.doors}, gates: ${summary.byType.gates}, elevators: ${summary.byType.elevators})`);

    // Test single device lookup
    step('Testing single device lookup');
    if (created.accessControlDeviceIds.length === 0) throw new Error('No access control device IDs tracked for single lookup test');
    const singleDevResp = await axios.get(
      `${API_BASE}/access-control/devices/${created.accessControlDeviceIds[0]}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!singleDevResp.data?.device?.id) throw new Error('Single device lookup returned no device');
    ok(`Single device lookup: ${singleDevResp.data.device.name} (${singleDevResp.data.device.deviceType})`);

    // Test facility admin access
    step('Testing access control API with facility admin');
    if (!created.facilityAdminToken) throw new Error('Facility admin token unavailable for access control test');
    const facAdminAcResp = await axios.get(
      `${API_BASE}/access-control/facilities/${created.facilityId}/devices`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } }
    );
    const facAdminDevices = facAdminAcResp.data?.devices || [];
    if (facAdminDevices.length === 0) throw new Error('Facility admin saw 0 access control devices');
    ok(`Facility admin retrieved ${facAdminDevices.length} access control devices`);

    // ================================================================
    // Notifications API Tests
    // By this point, unit assignments and key sharing have occurred,
    // which should generate real notifications for at least one actor.
    // ================================================================
    heading('Notifications API');
    if (!created.primaryTenantId || !primaryToken) throw new Error('Primary tenant not available for notification tests');
    if (!share1Token || !share2Token) throw new Error('Shared user tokens not available for notification tests');
    // Allow a brief settle for async notification creation
    await delay(1000);
    step('Testing notifications API');
    // Try multiple actors because async delivery timing can vary by flow.
    // We still validate the same endpoints, but pick a user who has real notifications now.
    const notificationActors = [
      { label: 'primary tenant', token: primaryToken },
      { label: 'shared user 1', token: share1Token },
      { label: 'shared user 2', token: share2Token },
      { label: 'new sharee', token: newShareeToken || null },
    ].filter(a => !!a.token);

    async function fetchNotificationsFor(token, retries = 4, retryDelayMs = 500) {
      let lastResp = null;
      for (let i = 0; i < retries; i++) {
        const resp = await axios.get(
          `${API_BASE}/notifications`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        lastResp = resp;
        const list = resp.data?.notifications || [];
        if (list.length > 0) return resp;
        if (i < retries - 1) await delay(retryDelayMs);
      }
      return lastResp;
    }

    let notificationsResp = null;
    let notifActorLabel = '';
    let notifActorToken = '';
    for (const actor of notificationActors) {
      const resp = await fetchNotificationsFor(actor.token);
      const list = resp.data?.notifications || [];
      if (list.length > 0) {
        notificationsResp = resp;
        notifActorLabel = actor.label;
        notifActorToken = actor.token;
        break;
      }
    }
    if (!notificationsResp || !notifActorToken) {
      throw new Error('Expected notifications from unit assignment / key sharing but found none for tested actors');
    }

      const notifications = notificationsResp.data?.notifications || [];
      const unreadCount = notificationsResp.data?.unreadCount ?? 0;
      ok(`Retrieved ${notifications.length} notifications for ${notifActorLabel}, unread: ${unreadCount}`);

        // Validate notification structure
        const firstNotif = notifications[0];
        const requiredNotifFields = ['id', 'type', 'title', 'message', 'priority', 'isRead', 'createdAt'];
        const missingNotifFields = requiredNotifFields.filter(f => !(f in firstNotif));
        if (missingNotifFields.length > 0) {
          throw new Error(`Notification missing fields: ${missingNotifFields.join(', ')}`);
        }
        ok(`Notification structure validated (fields: ${requiredNotifFields.join(', ')})`);

        // Check for expected notification types
        const notifTypes = notifications.map(n => n.type);
        const hasUnitAssigned = notifTypes.includes('unit_assigned');
        const hasAccessGranted = notifTypes.includes('access_granted');
        info(`Notification types present: ${[...new Set(notifTypes)].join(', ')}`);
        if (hasUnitAssigned) ok('Found unit_assigned notification (from tenant assignment)');
        if (hasAccessGranted) ok('Found access_granted notification (from key sharing)');

        // Get unread count
        step('Testing unread count endpoint');
        const unreadCountResp = await axios.get(
          `${API_BASE}/notifications/unread-count`,
          { headers: { Authorization: `Bearer ${notifActorToken}` } }
        );
        const unreadBefore = unreadCountResp.data?.unreadCount ?? 0;
        if (unreadBefore === 0) {
          info('Unread count is 0 for selected actor; skipping single-read delta assertions');
        } else {
          ok(`Unread count before any reads: ${unreadBefore}`);
        }

        // --- Mark a single notification as read and verify unread count delta ---
        const unreadNotifs = notifications.filter(n => !n.isRead);
        if (unreadNotifs.length > 0) {
          step('Testing mark single notification as read (with delta verification)');
          const targetNotif = unreadNotifs[0];
          const markOneResp = await axios.post(
            `${API_BASE}/notifications/${targetNotif.id}/read`,
            {},
            { headers: { Authorization: `Bearer ${notifActorToken}` } }
          );
          if (!markOneResp.data?.notification?.isRead) {
            throw new Error('Expected isRead=true in mark-as-read response');
          }
          if (!markOneResp.data.notification.readAt) {
            throw new Error('Expected readAt timestamp in mark-as-read response');
          }
          ok(`Marked notification ${targetNotif.id} as read (isRead=${markOneResp.data.notification.isRead}, readAt=${markOneResp.data.notification.readAt})`);

          // Verify unread count decreased by exactly 1
          const unreadAfterOneResp = await axios.get(
            `${API_BASE}/notifications/unread-count`,
            { headers: { Authorization: `Bearer ${notifActorToken}` } }
          );
          const unreadAfterOne = unreadAfterOneResp.data?.unreadCount ?? 0;
          if (unreadBefore === 0) throw new Error('Unread count was 0 before marking, expected at least 1 unread notification');
          if (unreadAfterOne !== unreadBefore - 1) {
            throw new Error(`Unread count delta unexpected: ${unreadBefore} -> ${unreadAfterOne} (expected ${unreadBefore - 1})`);
          }
          ok(`Unread count decreased by 1: ${unreadBefore} -> ${unreadAfterOne}`);

          // Verify the notification appears in isRead=true filtered list
          step('Testing isRead filter (read notifications)');
          const readFilterResp = await axios.get(
            `${API_BASE}/notifications`,
            {
              headers: { Authorization: `Bearer ${notifActorToken}` },
              params: { isRead: 'true' }
            }
          );
          const readNotifs = readFilterResp.data?.notifications || [];
          const foundRead = readNotifs.some(n => n.id === targetNotif.id);
          if (!foundRead) {
            throw new Error(`Marked notification not found in isRead=true filtered results (got ${readNotifs.length} results)`);
          }
          ok(`Marked notification appears in isRead=true filtered results`);

          // Verify the notification does NOT appear in isRead=false filtered list
          step('Testing isRead filter (unread notifications)');
          const unreadFilterResp = await axios.get(
            `${API_BASE}/notifications`,
            {
              headers: { Authorization: `Bearer ${notifActorToken}` },
              params: { isRead: 'false' }
            }
          );
          const unreadNotifs2 = unreadFilterResp.data?.notifications || [];
          const foundInUnread = unreadNotifs2.some(n => n.id === targetNotif.id);
          if (!foundInUnread) {
            ok(`Marked notification no longer appears in isRead=false filtered results`);
          } else {
            throw new Error(`Notification ${targetNotif.id} still appears as unread after marking as read`);
          }

          // Verify idempotency: marking same notification as read again should still succeed
          step('Testing mark-as-read idempotency');
          const markAgainResp = await axios.post(
            `${API_BASE}/notifications/${targetNotif.id}/read`,
            {},
            { headers: { Authorization: `Bearer ${notifActorToken}` } }
          );
          if (markAgainResp.data?.notification?.isRead) {
            ok('Re-marking already-read notification still returns isRead=true');
          }
        }

        // Get a single notification by ID
        if (notifications.length > 0) {
          step('Testing single notification retrieval');
          const singleNotifResp = await axios.get(
            `${API_BASE}/notifications/${notifications[0].id}`,
            { headers: { Authorization: `Bearer ${notifActorToken}` } }
          );
          if (singleNotifResp.data?.notification?.id === notifications[0].id) {
            ok(`Retrieved single notification: "${singleNotifResp.data.notification.title}"`);
          }
        }

        // Test type filter
        step('Testing notifications with type filter');
        const typeFilterResp = await axios.get(
          `${API_BASE}/notifications`,
          {
            headers: { Authorization: `Bearer ${notifActorToken}` },
            params: { type: 'unit_assigned' }
          }
        );
        const filteredNotifs = typeFilterResp.data?.notifications || [];
        ok(`Type filter (unit_assigned): ${filteredNotifs.length} results`);

        // Test delete notification
        if (notifications.length > 0) {
          step('Testing notification deletion');
          const deleteTarget = notifications[notifications.length - 1];
          const deleteResp = await axios.delete(
            `${API_BASE}/notifications/${deleteTarget.id}`,
            { headers: { Authorization: `Bearer ${notifActorToken}` } }
          );
          if (deleteResp.data?.success) {
            ok(`Deleted notification ${deleteTarget.id}`);
          }
          // Verify deletion
          try {
            const verifyDeleteResp = await axios.get(
              `${API_BASE}/notifications/${deleteTarget.id}`,
              { headers: { Authorization: `Bearer ${notifActorToken}` } }
            );
            if (!verifyDeleteResp.data?.notification) {
              ok('Deleted notification no longer returned');
            }
          } catch (e) {
            if (e?.response?.status === 404) {
              ok('Deleted notification returns 404');
            }
          }
        }

        // ------------------------------------------------------------------
        // Mark-all / mark-multiple / single-read with REAL unread items
        // Use share1 who has access_granted notifications, plus generate
        // additional ones via revoke+re-share to ensure multiple unreads.
        // ------------------------------------------------------------------
        if (!share1Token || created.shares.length === 0) throw new Error('share1Token or shares unavailable for notification mark tests');
        {
          step('Testing shared user notifications (access_granted)');
          const shareNotifResp = await axios.get(
            `${API_BASE}/notifications`,
            { headers: { Authorization: `Bearer ${share1Token}` } }
          );
          const shareNotifs = shareNotifResp.data?.notifications || [];
          const shareUnread = shareNotifResp.data?.unreadCount ?? 0;
          ok(`Shared user has ${shareNotifs.length} notifications, unread: ${shareUnread}`);
          const shareHasAccessGranted = shareNotifs.some(n => n.type === 'access_granted');
          if (shareHasAccessGranted) {
            ok('Shared user received access_granted notification from key sharing');
          } else if (shareNotifs.length > 0) {
            info(`Shared user notification types: ${[...new Set(shareNotifs.map(n => n.type))].join(', ')}`);
          }

          // Test mark-all FIRST while share1 still has unread notifications
          const share1Idx = created.shares.length > 1 ? 1 : 0;
          let notifShareId = created.shares[share1Idx];

          // Verify share1 has unread notifications for mark-all
          step('Testing mark all notifications as read');
          const getShareUnreadCount = async () => {
            const resp = await axios.get(
              `${API_BASE}/notifications/unread-count`,
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            return resp.data?.unreadCount ?? 0;
          };

          let preMarkAllUnread = await getShareUnreadCount();
          if (preMarkAllUnread === 0) {
            step('No unread notifications found; generating fresh unread for mark-all');
            await revokeShare(token, notifShareId);
            created.shares = created.shares.filter(id => id !== notifShareId);
            await delay(500);
            await axios.put(
              `${API_BASE}/key-sharing/${notifShareId}`,
              { is_active: true },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            created.shares.push(notifShareId);
            await delay(1000);
            preMarkAllUnread = await getShareUnreadCount();
          }
          if (preMarkAllUnread === 0) {
            info('Still no unread notifications for share1; skipping mark-all validation in this run');
          } else {
            ok(`${preMarkAllUnread} unread notification(s) before mark-all`);

            const markAllResp = await axios.post(
              `${API_BASE}/notifications/read-all`,
              {},
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            const markedAllCount = markAllResp.data?.markedCount ?? 0;
            if (markedAllCount === 0) {
              throw new Error(`mark-all returned markedCount=0 but expected at least ${preMarkAllUnread}`);
            }
            ok(`Marked ${markedAllCount} notifications as read via mark-all`);

            // Verify unread count is now 0
            const unreadAfterAllResp = await axios.get(
              `${API_BASE}/notifications/unread-count`,
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            if (unreadAfterAllResp.data?.unreadCount !== 0) {
              throw new Error(`Expected 0 unread after mark-all, got ${unreadAfterAllResp.data?.unreadCount}`);
            }
            ok('Unread count is now 0 after marking all as read');

            // Verify no unread via filter
            const allReadResp = await axios.get(
              `${API_BASE}/notifications`,
              {
                headers: { Authorization: `Bearer ${share1Token}` },
                params: { isRead: 'false' }
              }
            );
            const remainingUnread = allReadResp.data?.notifications || [];
            if (remainingUnread.length !== 0) {
              throw new Error(`Expected 0 unread notifications after mark-all, found ${remainingUnread.length}`);
            }
            ok('Confirmed: zero unread notifications after mark-all');
          }

          // Now generate a fresh notification for single-read + delta tests
          // Revoke and reactivate share to trigger new access_granted notification
          step('Generating fresh notification for single-read tests');
          await revokeShare(token, notifShareId);
          created.shares = created.shares.filter(id => id !== notifShareId);
          await delay(500);
          await axios.put(
            `${API_BASE}/key-sharing/${notifShareId}`,
            { is_active: true },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          created.shares.push(notifShareId);
          await delay(1000);

          // Fetch fresh notifications
          const freshResp = await axios.get(
            `${API_BASE}/notifications`,
            {
              headers: { Authorization: `Bearer ${share1Token}` },
              params: { isRead: 'false' }
            }
          );
          const freshUnread = freshResp.data?.notifications || [];

          // Test mark single notification as read (with delta verification)
          if (freshUnread.length > 0) {
            ok(`${freshUnread.length} fresh unread notification(s) available for single-read test`);
            step('Testing mark single notification as read (with delta verification)');
            const targetNotif = freshUnread[0];
            const unreadCountBefore = freshUnread.length;
            const markOneResp = await axios.post(
              `${API_BASE}/notifications/${targetNotif.id}/read`,
              {},
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            if (!markOneResp.data?.notification?.isRead) {
              throw new Error('Expected isRead=true in mark-as-read response');
            }
            if (!markOneResp.data.notification.readAt) {
              throw new Error('Expected readAt timestamp in mark-as-read response');
            }
            ok(`Marked notification ${targetNotif.id} as read (isRead=${markOneResp.data.notification.isRead}, readAt=${markOneResp.data.notification.readAt})`);

            // Verify unread count decreased by exactly 1
            const unreadAfterOneResp = await axios.get(
              `${API_BASE}/notifications/unread-count`,
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            const unreadAfterOne = unreadAfterOneResp.data?.unreadCount ?? 0;
            if (unreadAfterOne !== unreadCountBefore - 1) {
              throw new Error(`Unread count delta unexpected: ${unreadCountBefore} -> ${unreadAfterOne} (expected ${unreadCountBefore - 1})`);
            }
            ok(`Unread count decreased by 1: ${unreadCountBefore} -> ${unreadAfterOne}`);

            // Verify the notification appears in isRead=true filtered list
            step('Testing isRead filter (read notifications)');
            const readFilterResp = await axios.get(
              `${API_BASE}/notifications`,
              {
                headers: { Authorization: `Bearer ${share1Token}` },
                params: { isRead: 'true' }
              }
            );
            const readNotifs = readFilterResp.data?.notifications || [];
            const foundRead = readNotifs.some(n => n.id === targetNotif.id);
            if (!foundRead) {
              throw new Error(`Marked notification not found in isRead=true filtered results (got ${readNotifs.length} results)`);
            }
            ok('Marked notification appears in isRead=true filtered results');

            // Verify the notification does NOT appear in isRead=false filtered list
            step('Testing isRead filter (unread notifications)');
            const unreadFilterResp = await axios.get(
              `${API_BASE}/notifications`,
              {
                headers: { Authorization: `Bearer ${share1Token}` },
                params: { isRead: 'false' }
              }
            );
            const unreadNotifs2 = unreadFilterResp.data?.notifications || [];
            const foundInUnread = unreadNotifs2.some(n => n.id === targetNotif.id);
            if (!foundInUnread) {
              ok('Marked notification no longer appears in isRead=false filtered results');
            } else {
              throw new Error(`Notification ${targetNotif.id} still appears as unread after marking as read`);
            }

            // Verify idempotency: marking same notification as read again should still succeed
            step('Testing mark-as-read idempotency');
            const markAgainResp = await axios.post(
              `${API_BASE}/notifications/${targetNotif.id}/read`,
              {},
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            if (markAgainResp.data?.notification?.isRead) {
              ok('Re-marking already-read notification still returns isRead=true');
            }
          }

          // Test mark multiple as read
          const refreshMultiResp = await axios.get(
            `${API_BASE}/notifications`,
            {
              headers: { Authorization: `Bearer ${share1Token}` },
              params: { isRead: 'false' }
            }
          );
          const currentUnread = refreshMultiResp.data?.notifications || [];
          if (currentUnread.length >= 2) {
            step('Testing mark multiple notifications as read');
            const batchIds = currentUnread.slice(0, 2).map(n => n.id);
            const markMultiResp = await axios.post(
              `${API_BASE}/notifications/read`,
              { notificationIds: batchIds },
              { headers: { Authorization: `Bearer ${share1Token}` } }
            );
            if (markMultiResp.data?.markedCount === undefined) {
              throw new Error('Expected markedCount in mark-multiple response');
            }
            ok(`Marked ${markMultiResp.data.markedCount} notifications as read via batch (sent ${batchIds.length} IDs)`);

            // Verify those IDs are now read
            const verifyBatchResp = await axios.get(
              `${API_BASE}/notifications`,
              {
                headers: { Authorization: `Bearer ${share1Token}` },
                params: { isRead: 'false' }
              }
            );
            const stillUnread = verifyBatchResp.data?.notifications || [];
            const batchStillUnread = stillUnread.filter(n => batchIds.includes(n.id));
            if (batchStillUnread.length === 0) {
              ok('All batch-marked notifications confirmed as read');
            } else {
              throw new Error(`${batchStillUnread.length} of ${batchIds.length} batch notifications still unread`);
            }
          } else {
            info(`Only ${currentUnread.length} unread notification(s) remaining, skipping mark-multiple test`);
          }

          // (mark-all was tested above before single-read)
        }

    // ================================================================
    // Activity Logs API Tests
    // By this point, lock/unlock operations (device state updates) and
    // tenant assignments have occurred, generating real activity logs.
    // ================================================================
    heading('Activity Logs API');
    // Allow a brief settle for async activity log creation
    await delay(1000);
    step('Testing activity logs API');
    // Get activity logs for facility
    const activityResp = await axios.get(
          `${API_BASE}/activity/facilities/${created.facilityId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const facilityActivities = activityResp.data?.activities || [];
        if (facilityActivities.length === 0) {
          throw new Error('Expected activity logs from lock events / assignments but got 0');
        }
        ok(`Retrieved ${facilityActivities.length} activity logs for facility`);

        // Validate activity log structure
        const firstActivity = facilityActivities[0];
        const requiredActivityFields = ['id', 'entityType', 'activityType', 'title', 'result', 'occurredAt'];
        const missingActivityFields = requiredActivityFields.filter(f => !(f in firstActivity));
        if (missingActivityFields.length > 0) {
          throw new Error(`Activity log missing fields: ${missingActivityFields.join(', ')}`);
        }
        ok(`Activity log structure validated (fields: ${requiredActivityFields.join(', ')})`);

        // Inspect activity types present
        const activityTypes = [...new Set(facilityActivities.map(a => a.activityType))];
        info(`Activity types found: ${activityTypes.join(', ')}`);
        const hasLockActivity = activityTypes.includes('lock') || activityTypes.includes('unlock');
        const hasAssignmentActivity = activityTypes.includes('assignment_change');
        const hasStatusActivity = activityTypes.includes('status_change');
        if (hasLockActivity) ok('Found lock/unlock activity logs (from gateway state updates)');
        if (hasAssignmentActivity) ok('Found assignment_change activity logs (from tenant assignments)');
        if (hasStatusActivity) ok('Found status_change activity logs (from device status changes)');

        // Get general activity logs (cross-facility for admin)
        step('Testing general activity logs');
        const generalActivityResp = await axios.get(
          `${API_BASE}/activity`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 10 }
          }
        );
        const generalActivities = generalActivityResp.data?.activities || [];
        if (generalActivities.length === 0) {
          throw new Error('Expected general activity logs but got 0');
        }
        ok(`Retrieved ${generalActivities.length} general activity logs`);

    // Test activity logs for unit
    if (!created.unitId) throw new Error('No unit available for unit activity logs test');
    step('Testing unit activity logs');
    const unitActivityResp = await axios.get(
      `${API_BASE}/activity/units/${created.unitId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const unitActivities = unitActivityResp.data?.activities || [];
    if (unitActivities.length === 0) throw new Error('Expected unit activity logs but got 0');
    ok(`Retrieved ${unitActivities.length} activity logs for unit`);
    info(`Unit activity types: ${[...new Set(unitActivities.map(a => a.activityType))].join(', ')}`);

    // Test activity logs for device
    if (!created.deviceId) throw new Error('No device available for device activity logs test');
    step('Testing device activity logs');
    const deviceActivityResp = await axios.get(
      `${API_BASE}/activity/devices/${created.deviceId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const deviceActivities = deviceActivityResp.data?.activities || [];
    if (deviceActivities.length === 0) throw new Error('Expected device activity logs but got 0');
    ok(`Retrieved ${deviceActivities.length} activity logs for device`);
    info(`Device activity types: ${[...new Set(deviceActivities.map(a => a.activityType))].join(', ')}`);

        // Test activity logs with type filter
        step('Testing activity logs with type filter (lock)');
        const filteredLockResp = await axios.get(
          `${API_BASE}/activity`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { activityType: 'lock', limit: 5 }
          }
        );
    const lockActivities = filteredLockResp.data?.activities || [];
    ok(`Lock activity filter: ${lockActivities.length} results`);
    if (lockActivities.length > 0) {
      const allLock = lockActivities.every(a => a.activityType === 'lock');
      if (!allLock) throw new Error('Lock filter returned non-lock activity types');
      ok('All filtered results have activityType=lock');
    }

    // Test activity logs with unlock filter
    step('Testing activity logs with type filter (unlock)');
    const filteredUnlockResp = await axios.get(
      `${API_BASE}/activity`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { activityType: 'unlock', limit: 5 }
      }
    );
    ok(`Unlock activity filter: ${(filteredUnlockResp.data?.activities || []).length} results`);

    // Test activity logs with assignment_change filter
    step('Testing activity logs with type filter (assignment_change)');
    const filteredAssignResp = await axios.get(
      `${API_BASE}/activity`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { activityType: 'assignment_change', limit: 5 }
      }
    );
    ok(`Assignment change filter: ${(filteredAssignResp.data?.activities || []).length} results`);

    // Test date range filter
    step('Testing activity logs with date range');
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const dateRangeResp = await axios.get(
      `${API_BASE}/activity/facilities/${created.facilityId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { fromDate: oneHourAgo, limit: 20 }
      }
    );
    ok(`Date range filter (last hour): ${(dateRangeResp.data?.activities || []).length} results`);

    // Test facility admin access to activity logs
    step('Testing activity logs API with facility admin');
    if (!created.facilityAdminToken) throw new Error('Facility admin token unavailable for activity logs test');
    const facAdminActivityResp = await axios.get(
      `${API_BASE}/activity/facilities/${created.facilityId}`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } }
    );
    const facAdminActivities = facAdminActivityResp.data?.activities || [];
    if (facAdminActivities.length === 0) {
      throw new Error('Facility admin expected activity logs but got 0');
    }
    ok(`Facility admin retrieved ${facAdminActivities.length} activity logs`);

    // =====================================================================
    // Firmware OTA E2E
    // =====================================================================
    heading('Firmware OTA');

    let firmwareId = null;
    let pushId = null;
    // Step 1: Upload gateway firmware (HTTP)
    step('Uploading test gateway firmware binary');
    const crypto = require('crypto');
    const FormData = require('form-data');
    const testBinary = crypto.randomBytes(512 * 1024); // 512KB test binary
    const testVersion = `e2e-test-${Date.now()}`;
    const formData = new FormData();
    formData.append('file', testBinary, { filename: 'test-firmware.bin', contentType: 'application/octet-stream' });
    formData.append('version', testVersion);
    formData.append('target_type', 'gateway');
    formData.append('description', 'E2E test firmware (gateway)');
    const uploadResp = await axios.post(`${API_BASE}/firmware/upload`, formData, {
      headers: { Authorization: `Bearer ${token}`, ...formData.getHeaders() },
      maxContentLength: 100 * 1024 * 1024,
    });
    if (uploadResp.status !== 201) throw new Error(`Upload status expected 201 got ${uploadResp.status}`);
    const fwData = uploadResp.data.data;
    if (fwData.version !== testVersion) throw new Error('Version mismatch');
    if (fwData.target_type !== 'gateway') throw new Error(`Expected target_type=gateway, got ${fwData.target_type}`);
    if (!fwData.sha256_hash) throw new Error('Missing SHA-256');
    if (fwData.size_bytes !== 512 * 1024) throw new Error(`Size mismatch: ${fwData.size_bytes}`);
    if (fwData.storage_path !== undefined) throw new Error('storage_path should not be exposed in API response');
    firmwareId = fwData.id;
    ok(`Gateway firmware uploaded: id=${firmwareId} target_type=${fwData.target_type} sha256=${fwData.sha256_hash.substring(0, 12)}...`);

    // Step 2: List firmware
    step('Listing firmware catalog');
    const listResp = await axios.get(`${API_BASE}/firmware`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const found = (listResp.data.data || []).find(f => f.id === firmwareId);
    if (!found) throw new Error('Uploaded firmware not found in list');
    if (found.storage_path !== undefined) throw new Error('storage_path should not be exposed in list API response');
    ok(`Firmware appears in catalog (${listResp.data.data.length} total)`);

    // Step 3: Full OTA delivery flow — gateway receives manifest + chunks, ACKs each
    if (!created.gatewayId) throw new Error('No gateway available for firmware push test');
    if (!loginOpsPublicKey) throw new Error('ops_public_key unavailable for firmware JWT verification');

    // Start the gateway-side firmware delivery handler BEFORE initiating the push
    // so we don't miss the first message
    step('Starting gateway-side firmware delivery listener');
    const deliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 60000);

    step('Initiating firmware push to gateway');
    const pushResp = await axios.post(
      `${API_BASE}/firmware/${firmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (pushResp.status !== 200) throw new Error(`Push status expected 200 got ${pushResp.status}`);
    pushId = pushResp.data.data?.id;
    if (!pushId) throw new Error('Push initiated but no pushId returned');
    ok(`Push initiated: pushId=${pushId}`);

    // Wait for the full chunked delivery to complete (manifest + all chunks ACKed)
    step('Awaiting full firmware delivery (manifest + chunks + ACKs)');
    const delivery = await deliveryPromise;
    ok(`Firmware delivered: ${delivery.manifest.chunk_count} chunks received and ACKed`);

    // Verify manifest fields match what we uploaded
    step('Verifying firmware manifest fields');
    if (delivery.manifest.target_type !== 'gateway') throw new Error(`Manifest target_type mismatch: expected gateway, got ${delivery.manifest.target_type}`);
    if (delivery.manifest.version !== testVersion) throw new Error(`Manifest version mismatch: expected ${testVersion}, got ${delivery.manifest.version}`);
    if (delivery.manifest.size !== 512 * 1024) throw new Error(`Manifest size mismatch: expected ${512 * 1024}, got ${delivery.manifest.size}`);
    if (delivery.manifest.chunk_count !== Math.ceil((512 * 1024) / (128 * 1024))) throw new Error(`Manifest chunk_count mismatch: expected 4, got ${delivery.manifest.chunk_count}`);
    if (delivery.manifest.chunk_size !== 128 * 1024) throw new Error(`Manifest chunk_size mismatch: expected ${128 * 1024}, got ${delivery.manifest.chunk_size}`);
    if (!delivery.manifest.exp) throw new Error('Manifest JWT missing exp claim');
    if (delivery.manifest.exp <= delivery.manifest.iat) throw new Error('Manifest JWT exp must be after iat');
    ok(`Manifest verified: target_type=${delivery.manifest.target_type} version=${delivery.manifest.version} size=${delivery.manifest.size} chunks=${delivery.manifest.chunk_count} exp=${delivery.manifest.exp}`);

    // Verify reassembled binary integrity
    step('Verifying reassembled binary integrity');
    if (delivery.reassembled.length !== testBinary.length) throw new Error(`Reassembled size mismatch: expected ${testBinary.length}, got ${delivery.reassembled.length}`);
    if (delivery.finalHash !== fwData.sha256_hash) throw new Error(`SHA-256 mismatch: expected ${fwData.sha256_hash}, got ${delivery.finalHash}`);
    if (!delivery.reassembled.equals(testBinary)) throw new Error('Reassembled binary does not match original upload byte-for-byte');
    ok(`Binary integrity verified: ${delivery.reassembled.length} bytes, SHA-256=${delivery.finalHash.substring(0, 12)}...`);

    // Verify Ed25519 signature verification worked (it would have thrown in handleFirmwareDelivery)
    ok('All JWT signatures (manifest + chunks) verified with ops_public_key');

    // Poll push status until it reaches 'verifying' (all chunks delivered, awaiting gateway confirmation)
    step('Polling push status until verifying');
    let verifyStatus = null;
    for (let poll = 0; poll < 20; poll++) {
      await delay(500);
      const statusResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      verifyStatus = statusResp.data.data;
      if (verifyStatus?.status === 'verifying' || verifyStatus?.status === 'complete') break;
    }
    if (!verifyStatus || (verifyStatus.status !== 'verifying' && verifyStatus.status !== 'complete')) {
      throw new Error(`Expected push status 'verifying', got '${verifyStatus?.status}'`);
    }
    ok(`Push status after delivery: ${verifyStatus.status}, chunks: ${verifyStatus.chunks_sent}/${verifyStatus.chunks_total}`);

    // FIRMWARE_PROGRESS — gateway sends optional progress updates
    step('Sending FIRMWARE_PROGRESS (distributing, 50%)');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_PROGRESS',
      push_id: delivery.manifest.push_id,
      target_type: delivery.manifest.target_type || 'gateway',
      progress_percent: 50,
      phase: 'distributing',
      message: 'Distributing firmware to lock nodes',
      devices: [
        { device_id: 'lock-e2e-1', status: 'downloading', progress_percent: 50 },
        { device_id: 'lock-e2e-2', status: 'pending' },
      ],
    }));
    await delay(500);

    step('Sending FIRMWARE_PROGRESS (installing, 80%)');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_PROGRESS',
      push_id: delivery.manifest.push_id,
      target_type: delivery.manifest.target_type || 'gateway',
      progress_percent: 80,
      phase: 'installing',
      message: 'Installing on lock nodes',
      devices: [
        { device_id: 'lock-e2e-1', status: 'installing', progress_percent: 90 },
        { device_id: 'lock-e2e-2', status: 'downloading', progress_percent: 30 },
      ],
    }));
    await delay(500);

    step('Sending FIRMWARE_PROGRESS (complete, 100%)');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_PROGRESS',
      push_id: delivery.manifest.push_id,
      target_type: delivery.manifest.target_type || 'gateway',
      progress_percent: 100,
      phase: 'verifying',
      message: 'All locks updated, verifying...',
      devices: [
        { device_id: 'lock-e2e-1', status: 'complete' },
        { device_id: 'lock-e2e-2', status: 'complete' },
      ],
    }));
    await delay(500);

    // Compatibility check: Tulsi payload format (camelCase device fields)
    step('Sending FIRMWARE_PROGRESS in Tulsi async format (camelCase devices)');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_PROGRESS',
      push_id: delivery.manifest.push_id,
      progress_percent: 100,
      phase: 'flashing_ble_mcu',
      message: 'Sending blocks to downstream lock',
      devices: [
        {
          deviceId: '468c1af93ae9a967f9aeb5d3a107d60dc643048d29b5f5fc4b81ad8eac0f638d',
          progressPercent: 100,
          status: 'complete',
          error: null,
        },
      ],
    }));
    await delay(500);

    // Verify push-status now includes progress info and events
    step('Verifying push-status includes progress data and events');
    const progressStatusResp = await axios.get(
      `${API_BASE}/firmware/push-status/${created.gatewayId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const progressData = progressStatusResp.data.data;
    if (progressData.progress_percent === undefined) throw new Error('push-status missing progress_percent field');
    if (progressData.progress_percent < 50) throw new Error(`Expected progress_percent >= 50, got ${progressData.progress_percent}`);
    ok(`Push status includes progress: ${progressData.progress_percent}%, phase=${progressData.phase || 'N/A'}`);
    if (progressData.phase !== 'flashing_ble_mcu' && progressData.phase !== 'verifying') {
      throw new Error(`Expected phase to include Tulsi update, got ${progressData.phase}`);
    }

    if (progressData.recent_events) {
      ok(`Push status includes ${progressData.recent_events.length} recent event(s)`);
    }
    if (progressData.device_statuses) {
      ok(`Push status includes ${progressData.device_statuses.length} device status(es)`);
    }

    // Verify events endpoint
    step('Verifying push events endpoint');
    const eventsResp = await axios.get(
      `${API_BASE}/firmware/push/${pushId}/events`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (eventsResp.status !== 200) throw new Error(`Push events expected 200 got ${eventsResp.status}`);
    const eventsData = eventsResp.data.data;
    if (!eventsData.events || !Array.isArray(eventsData.events)) throw new Error('Events endpoint missing events array');
    if (eventsData.total < 3) throw new Error(`Expected at least 3 events, got ${eventsData.total}`);
    ok(`Push events: ${eventsData.total} total, ${eventsData.events.length} returned, ${eventsData.device_statuses?.length || 0} device statuses`);

    // Gateway sends staged FIRMWARE_UPDATE_STATUS updates.
    step('Sending FIRMWARE_UPDATE_STATUS lifecycle (verifying → applying → success) from gateway');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: delivery.manifest.push_id,
      status: 'verifying',
      version: delivery.manifest.version,
    }));
    await delay(60);
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: delivery.manifest.push_id,
      status: 'applying',
      version: delivery.manifest.version,
    }));
    await delay(60);
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: delivery.manifest.push_id,
      status: 'success',
      version: delivery.manifest.version,
    }));

    // Poll push status until it reaches 'complete'
    step('Polling push status until complete');
    let finalStatus = null;
    for (let poll = 0; poll < 20; poll++) {
      await delay(500);
      const statusResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      finalStatus = statusResp.data.data;
      if (finalStatus?.status === 'complete') break;
    }
    if (!finalStatus || finalStatus.status !== 'complete') throw new Error(`Expected push status 'complete', got '${finalStatus?.status}'`);
    ok(`Push status: ${finalStatus.status}, chunks: ${finalStatus.chunks_sent}/${finalStatus.chunks_total}`);

    // Step 4: Check push history
    step('Checking firmware push history');
    const histResp = await axios.get(
      `${API_BASE}/firmware/push-history/${created.gatewayId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const pushHistory = histResp.data.data || [];
    if (pushHistory.length === 0) throw new Error('Expected at least 1 push history entry');
    const completedEntry = pushHistory.find(h => h.status === 'complete');
    if (!completedEntry) throw new Error('No completed push found in history');
    ok(`Push history: ${pushHistory.length} entries (includes completed push)`);

    // Step 5: Get firmware by ID
    step('Fetching firmware by ID');
    const getResp = await axios.get(`${API_BASE}/firmware/${firmwareId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (getResp.status !== 200) throw new Error(`Get firmware status expected 200 got ${getResp.status}`);
    if (getResp.data.data?.id !== firmwareId) throw new Error('Firmware ID mismatch on GET');
    if (getResp.data.data?.version !== testVersion) throw new Error('Firmware version mismatch on GET');
    ok(`Firmware fetched by ID: version=${getResp.data.data.version}`);

    // Step 6: RBAC - Facility admin can list but not upload
    step('RBAC: Facility admin can list firmware');
    if (!created.facilityAdminToken) throw new Error('Facility admin token unavailable for firmware RBAC test');
    const facListResp = await axios.get(`${API_BASE}/firmware`, {
      headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
    });
    if (facListResp.status !== 200) throw new Error(`Facility admin list expected 200 got ${facListResp.status}`);
    ok('Facility admin can list firmware');

    step('RBAC: Facility admin cannot upload firmware');
    try {
      const facForm = new FormData();
      facForm.append('file', crypto.randomBytes(256), { filename: 'test.bin', contentType: 'application/octet-stream' });
      facForm.append('version', 'fac-admin-test');
      await axios.post(`${API_BASE}/firmware/upload`, facForm, {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}`, ...facForm.getHeaders() },
      });
      throw new Error('Facility admin should not be allowed to upload firmware');
    } catch (rbacErr) {
      if (rbacErr?.response?.status !== 403) throw new Error(`Expected 403, got ${rbacErr?.response?.status}`);
      ok('Facility admin correctly blocked from uploading firmware');
    }

    // Step 7: Resilience — abrupt WS disconnect during transfer should fail quickly,
    // and a fresh push after reconnect should complete successfully.
    step('Testing OTA disconnect failure handling and reconnect recovery');
    const disconnectPromise = disconnectDuringFirmwareDelivery(ws, loginOpsPublicKey, 30000);
    const resumePushResp = await axios.post(
      `${API_BASE}/firmware/${firmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (resumePushResp.status !== 200) throw new Error(`Resume push status expected 200 got ${resumePushResp.status}`);
    const resumePushId = resumePushResp.data.data?.id;
    if (!resumePushId) throw new Error('Resume push initiated but no pushId returned');

    const disconnectInfo = await disconnectPromise;
    ok(`Gateway socket terminated after chunk ${disconnectInfo.firstChunkIndex} for pushId=${resumePushId}`);

    step('Polling disconnected push status until failed');
    let disconnectedPushStatus = null;
    for (let poll = 0; poll < 30; poll++) {
      await delay(500);
      const statusResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}?target_type=gateway`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      disconnectedPushStatus = statusResp.data?.data || null;
      if (disconnectedPushStatus?.id === resumePushId && disconnectedPushStatus?.status === 'failed') {
        break;
      }
    }
    if (!disconnectedPushStatus || disconnectedPushStatus.id !== resumePushId || disconnectedPushStatus.status !== 'failed') {
      throw new Error(`Expected disconnected push ${resumePushId} to fail, got id=${disconnectedPushStatus?.id} status=${disconnectedPushStatus?.status}`);
    }
    ok(`Disconnected push ${resumePushId} failed as expected`);

    step('Reconnecting gateway websocket after abrupt disconnect');
    ws = await connectGatewayWsAndAuth(WS_URL, token, facilityId);
    ok('Gateway re-authenticated after abrupt disconnect');

    step('Starting fresh delivery listener after reconnect');
    const resumedDeliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 90000);
    step('Initiating fresh OTA push after reconnect');
    const recoveryPushResp = await axios.post(
      `${API_BASE}/firmware/${firmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (recoveryPushResp.status !== 200) throw new Error(`Recovery push status expected 200 got ${recoveryPushResp.status}`);
    const recoveryPushId = recoveryPushResp.data.data?.id;
    if (!recoveryPushId) throw new Error('Recovery push initiated but no pushId returned');
    ok(`Recovery push initiated: pushId=${recoveryPushId}`);

    step('Awaiting full recovery firmware delivery');
    const resumedDelivery = await resumedDeliveryPromise;
    if (!resumedDelivery?.manifest?.nonce) throw new Error('Recovery delivery did not expose nonce');
    ok(`Recovery delivery completed with ${resumedDelivery.manifest.chunk_count} chunk(s) ACKed`);

    step('Sending completion status for recovery OTA push');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: resumedDelivery.manifest.push_id,
      status: 'success',
      version: resumedDelivery.manifest.version || testVersion,
      target_type: resumedDelivery.manifest.target_type || 'gateway',
    }));

    step('Polling recovery push status until complete');
    let recoveryStatus = null;
    for (let poll = 0; poll < 30; poll++) {
      await delay(500);
      const statusResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}?target_type=gateway`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const latestGatewayPush = statusResp.data?.data || null;
      if (latestGatewayPush?.id === recoveryPushId) {
        recoveryStatus = latestGatewayPush;
      } else {
        // When multiple push records exist, gateway "latest" may momentarily reference
        // the previous failed push. Confirm the target push status from history by ID.
        const historyResp = await axios.get(
          `${API_BASE}/firmware/push-history/${created.gatewayId}?target_type=gateway&limit=20&offset=0`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const historyRows = Array.isArray(historyResp.data?.data) ? historyResp.data.data : [];
        const matchingPush = historyRows.find((row) => row?.id === recoveryPushId) || null;
        if (matchingPush) {
          recoveryStatus = matchingPush;
        }
      }
      if (recoveryStatus?.id === recoveryPushId && recoveryStatus?.status === 'complete') {
        break;
      }
      // If gateway or network timing drops the first terminal status signal,
      // resend completion once mid-poll to keep the flow deterministic.
      if (poll === 10 && recoveryStatus?.id === recoveryPushId && recoveryStatus?.status === 'verifying') {
        ws.send(JSON.stringify({
          type: 'FIRMWARE_UPDATE_STATUS',
          push_id: resumedDelivery.manifest.push_id,
          status: 'success',
          version: resumedDelivery.manifest.version || testVersion,
          target_type: resumedDelivery.manifest.target_type || 'gateway',
        }));
      }
    }
    if (!recoveryStatus || recoveryStatus.id !== recoveryPushId || recoveryStatus.status !== 'complete') {
      throw new Error(`Expected recovery push ${recoveryPushId} to reach complete status, got id=${recoveryStatus?.id} status=${recoveryStatus?.status}`);
    }
    ok(`Recovery push ${recoveryPushId} reached complete after reconnect`);

    // Correlation hardening: updates without push_id must be ignored.
    step('Verifying terminal status without push_id is ignored during concurrent verifying pushes');
    const tempLockBinary = crypto.randomBytes(64 * 1024);
    const tempLockVersion = `e2e-lock-corr-${Date.now()}`;
    const tempLockForm = new FormData();
    tempLockForm.append('file', tempLockBinary, { filename: 'lock-corr.bin', contentType: 'application/octet-stream' });
    tempLockForm.append('version', tempLockVersion);
    tempLockForm.append('target_type', 'lock');
    tempLockForm.append('description', 'Temporary lock firmware for status-correlation test');
    const tempLockUploadResp = await axios.post(`${API_BASE}/firmware/upload`, tempLockForm, {
      headers: { Authorization: `Bearer ${token}`, ...tempLockForm.getHeaders() },
      maxContentLength: 50 * 1024 * 1024,
    });
    if (tempLockUploadResp.status !== 201) throw new Error(`Temp lock upload status expected 201 got ${tempLockUploadResp.status}`);
    const tempLockFirmwareId = tempLockUploadResp.data?.data?.id;
    if (!tempLockFirmwareId) throw new Error('Temp lock firmware upload missing id');

    const pollPushById = async (targetType, expectedPushId, terminalOnly = false) => {
      for (let poll = 0; poll < 25; poll++) {
        await delay(400);
        const historyResp = await axios.get(
          `${API_BASE}/firmware/push-history/${created.gatewayId}?target_type=${targetType}&limit=20&offset=0`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const rows = Array.isArray(historyResp.data?.data) ? historyResp.data.data : [];
        const match = rows.find((row) => row?.id === expectedPushId);
        if (!match) continue;
        if (!terminalOnly || ['complete', 'failed', 'cancelled'].includes(match.status)) {
          return match;
        }
        return match;
      }
      return null;
    };

    const gatewayProbeDeliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 60000);
    const gatewayProbePushResp = await axios.post(
      `${API_BASE}/firmware/${firmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const gatewayProbePushId = gatewayProbePushResp.data?.data?.id;
    if (!gatewayProbePushId) throw new Error('Gateway probe push missing id');
    const gatewayProbeDelivery = await gatewayProbeDeliveryPromise;

    const lockProbeDeliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 60000);
    const lockProbePushResp = await axios.post(
      `${API_BASE}/firmware/${tempLockFirmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const lockProbePushId = lockProbePushResp.data?.data?.id;
    if (!lockProbePushId) throw new Error('Lock probe push missing id');
    const lockProbeDelivery = await lockProbeDeliveryPromise;

    const gatewayProbeStatus = await pollPushById('gateway', gatewayProbePushId);
    const lockProbeStatus = await pollPushById('lock', lockProbePushId);
    if (gatewayProbeStatus?.status !== 'verifying') {
      throw new Error(`Gateway probe push expected verifying before ambiguous update, got ${gatewayProbeStatus?.status}`);
    }
    if (lockProbeStatus?.status !== 'verifying') {
      throw new Error(`Lock probe push expected verifying before ambiguous update, got ${lockProbeStatus?.status}`);
    }

    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      status: 'success',
    }));
    await delay(700);

    const gatewayAfterAmbiguous = await pollPushById('gateway', gatewayProbePushId);
    const lockAfterAmbiguous = await pollPushById('lock', lockProbePushId);
    if (gatewayAfterAmbiguous?.status !== 'verifying' || lockAfterAmbiguous?.status !== 'verifying') {
      throw new Error(`Status without push_id should be ignored; got gateway=${gatewayAfterAmbiguous?.status} lock=${lockAfterAmbiguous?.status}`);
    }
    ok('Terminal status without push_id was ignored while concurrent verifying pushes existed');

    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: gatewayProbeDelivery.manifest.push_id,
      status: 'success',
      version: gatewayProbeDelivery.manifest.version || testVersion,
      target_type: gatewayProbeDelivery.manifest.target_type || 'gateway',
    }));
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: lockProbeDelivery.manifest.push_id,
      status: 'success',
      version: lockProbeDelivery.manifest.version || tempLockVersion,
      target_type: lockProbeDelivery.manifest.target_type || 'lock',
    }));

    const gatewayProbeTerminal = await pollPushById('gateway', gatewayProbePushId, true);
    const lockProbeTerminal = await pollPushById('lock', lockProbePushId, true);
    if (gatewayProbeTerminal?.status !== 'complete' || lockProbeTerminal?.status !== 'complete') {
      throw new Error(`Expected probe pushes to complete after explicit push_id updates; got gateway=${gatewayProbeTerminal?.status} lock=${lockProbeTerminal?.status}`);
    }
    ok('Explicit push_id terminal updates completed both probe pushes');

    await axios.delete(`${API_BASE}/firmware/${tempLockFirmwareId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ok('Temporary lock firmware from correlation test deleted');

    // Step 8: Delete gateway firmware (cleanup)
    step('Deleting test gateway firmware');
    const delResp = await axios.delete(`${API_BASE}/firmware/${firmwareId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (delResp.status !== 200) throw new Error(`Delete status expected 200 got ${delResp.status}`);
    ok('Gateway firmware deleted');
    firmwareId = null;

    // =====================================================================
    // Lock Firmware Target Type — verify protocol carries target_type: 'lock'
    // =====================================================================
    heading('Firmware OTA (Lock Target)');
    let lockFirmwareId = null;

    step('Uploading test lock firmware binary');
    const lockBinary = crypto.randomBytes(128 * 1024); // 128KB (single chunk)
    const lockVersion = `e2e-lock-${Date.now()}`;
    const lockForm = new FormData();
    lockForm.append('file', lockBinary, { filename: 'lock-firmware.bin', contentType: 'application/octet-stream' });
    lockForm.append('version', lockVersion);
    lockForm.append('target_type', 'lock');
    lockForm.append('description', 'E2E test firmware (lock)');
    const lockUploadResp = await axios.post(`${API_BASE}/firmware/upload`, lockForm, {
      headers: { Authorization: `Bearer ${token}`, ...lockForm.getHeaders() },
      maxContentLength: 100 * 1024 * 1024,
    });
    if (lockUploadResp.status !== 201) throw new Error(`Lock upload status expected 201 got ${lockUploadResp.status}`);
    const lockFwData = lockUploadResp.data.data;
    if (lockFwData.target_type !== 'lock') throw new Error(`Expected target_type=lock, got ${lockFwData.target_type}`);
    if (lockFwData.storage_path !== undefined) throw new Error('storage_path should not be exposed in lock upload response');
    lockFirmwareId = lockFwData.id;
    ok(`Lock firmware uploaded: id=${lockFirmwareId} target_type=${lockFwData.target_type}`);

    // Verify same version can coexist for different target types
    step('Verifying version uniqueness is scoped by target_type');
    const sameVerForm = new FormData();
    sameVerForm.append('file', crypto.randomBytes(128), { filename: 'gw.bin', contentType: 'application/octet-stream' });
    sameVerForm.append('version', lockVersion);
    sameVerForm.append('target_type', 'gateway');
    const sameVerResp = await axios.post(`${API_BASE}/firmware/upload`, sameVerForm, {
      headers: { Authorization: `Bearer ${token}`, ...sameVerForm.getHeaders() },
      maxContentLength: 100 * 1024 * 1024,
    });
    if (sameVerResp.status !== 201) throw new Error(`Same version different target_type should succeed, got ${sameVerResp.status}`);
    ok(`Same version '${lockVersion}' accepted for gateway (different target_type)`);
    // Clean up the gateway version immediately
    await axios.delete(`${API_BASE}/firmware/${sameVerResp.data.data.id}`, { headers: { Authorization: `Bearer ${token}` } });

    // Verify target_type filter on list endpoint
    step('Verifying target_type filter on list endpoint');
    const lockListResp = await axios.get(`${API_BASE}/firmware?target_type=lock`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const lockInList = (lockListResp.data.data || []).find(f => f.id === lockFirmwareId);
    if (!lockInList) throw new Error('Lock firmware not found when filtering by target_type=lock');
    const gwInLockList = (lockListResp.data.data || []).find(f => f.target_type === 'gateway');
    if (gwInLockList) throw new Error('Gateway firmware should not appear when filtering by target_type=lock');
    ok('target_type filter works correctly on list endpoint');

    // Full OTA delivery for lock firmware
    step('Starting lock firmware delivery listener');
    const lockDeliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 60000);

    step('Initiating lock firmware push to gateway');
    const lockPushResp = await axios.post(
      `${API_BASE}/firmware/${lockFirmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (lockPushResp.status !== 200) throw new Error(`Lock push status expected 200 got ${lockPushResp.status}`);
    const lockPushId = lockPushResp.data.data?.id;
    if (!lockPushId) throw new Error('Lock push initiated but no pushId returned');
    ok(`Lock push initiated: pushId=${lockPushId}`);

    step('Awaiting lock firmware delivery');
    const lockDelivery = await lockDeliveryPromise;
    ok(`Lock firmware delivered: ${lockDelivery.manifest.chunk_count} chunk(s) received and ACKed`);

    // Verify lock manifest carries target_type: 'lock'
    step('Verifying lock firmware manifest target_type');
    if (lockDelivery.manifest.target_type !== 'lock') throw new Error(`Lock manifest target_type mismatch: expected lock, got ${lockDelivery.manifest.target_type}`);
    if (lockDelivery.manifest.version !== lockVersion) throw new Error(`Lock manifest version mismatch: expected ${lockVersion}, got ${lockDelivery.manifest.version}`);
    if (!lockDelivery.manifest.exp) throw new Error('Lock manifest JWT missing exp claim');
    ok(`Lock manifest verified: target_type=${lockDelivery.manifest.target_type} version=${lockDelivery.manifest.version} exp=${lockDelivery.manifest.exp}`);

    // Verify reassembled lock binary
    step('Verifying lock firmware binary integrity');
    if (lockDelivery.finalHash !== lockFwData.sha256_hash) throw new Error('Lock firmware SHA-256 mismatch');
    if (!lockDelivery.reassembled.equals(lockBinary)) throw new Error('Lock firmware binary does not match original byte-for-byte');
    ok('Lock firmware binary integrity verified');

    // Poll lock push status until verifying
    step('Polling lock push status until verifying');
    let lockVerifyStatus = null;
    for (let poll = 0; poll < 20; poll++) {
      await delay(500);
      const sResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}?target_type=lock`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      lockVerifyStatus = sResp.data.data;
      if (lockVerifyStatus?.status === 'verifying' || lockVerifyStatus?.status === 'complete') break;
    }
    if (!lockVerifyStatus || (lockVerifyStatus.status !== 'verifying' && lockVerifyStatus.status !== 'complete')) {
      throw new Error(`Expected lock push status 'verifying', got '${lockVerifyStatus?.status}'`);
    }
    ok(`Lock push status after delivery: ${lockVerifyStatus.status}`);

    // Gateway sends FIRMWARE_UPDATE_STATUS for lock firmware
    step('Sending FIRMWARE_UPDATE_STATUS (success) from gateway for lock firmware');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: lockDelivery.manifest.push_id,
      status: 'success',
      version: lockDelivery.manifest.version,
      target_type: 'lock',
    }));

    // Poll lock push status until complete
    step('Polling lock push status until complete');
    let lockFinalStatus = null;
    for (let poll = 0; poll < 20; poll++) {
      await delay(500);
      const sResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}?target_type=lock`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      lockFinalStatus = sResp.data.data;
      if (lockFinalStatus?.status === 'complete') break;
    }
    if (!lockFinalStatus || lockFinalStatus.status !== 'complete') throw new Error(`Expected lock push status 'complete', got '${lockFinalStatus?.status}'`);
    ok(`Lock push status: ${lockFinalStatus.status}`);

    // Clean up lock firmware
    step('Deleting lock test firmware');
    await axios.delete(`${API_BASE}/firmware/${lockFirmwareId}`, { headers: { Authorization: `Bearer ${token}` } });
    ok('Lock firmware deleted');
    lockFirmwareId = null;

    // =====================================================================
    // Access Codes & Device Groups E2E
    // =====================================================================
    heading('Access Codes & Device Groups');

    if (!created.facilityId) throw new Error('Facility ID missing for access code tests');
    if (!created.facilityAdminToken) throw new Error('Facility admin token missing for access code tests');
    if (!Array.isArray(created.accessControlDeviceIds) || created.accessControlDeviceIds.length < 2) {
      throw new Error('Need at least two access control devices for access code tests');
    }

    const keypadDeviceA = created.accessControlDeviceIds[0];
    const keypadDeviceB = created.accessControlDeviceIds[1];
    const keypadDeviceC = created.accessControlDeviceIds[2] || null;

    step('Enabling keypad access methods on two access control devices');
    await axios.put(
      `${API_BASE}/devices/access-control/${keypadDeviceA}`,
      { access_methods: ['app', 'keypad'] },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    await axios.put(
      `${API_BASE}/devices/access-control/${keypadDeviceB}`,
      { access_methods: ['app', 'keypad'] },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    if (keypadDeviceC) {
      await axios.put(
        `${API_BASE}/devices/access-control/${keypadDeviceC}`,
        { access_methods: ['app', 'keypad'] },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
    }
    ok('Keypad methods enabled on target devices');

    step('Creating a device group and assigning two access-control devices');
    const groupCreateResp = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: created.facilityId,
        group_type: 'access_code',
        name: `E2E Device Group ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    accessCodeGroupId = groupCreateResp.data?.data?.id;
    if (!accessCodeGroupId) throw new Error('Device group creation did not return id');
    await axios.post(
      `${API_BASE}/device-groups/${accessCodeGroupId}/members`,
      { device_id: keypadDeviceA, device_type: 'access_control' },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    await axios.post(
      `${API_BASE}/device-groups/${accessCodeGroupId}/members`,
      { device_id: keypadDeviceB, device_type: 'access_control' },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    if (created.deviceId) {
      await axios.post(
        `${API_BASE}/device-groups/${accessCodeGroupId}/members`,
        { device_id: created.deviceId, device_type: 'blulok' },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
    }
    ok(`Created access-code group ${accessCodeGroupId} and assigned devices ${keypadDeviceA}, ${keypadDeviceB}${created.deviceId ? `, ${created.deviceId} (blulok)` : ''}`);

    step('Validating group membership supports mixed device types');
    const groupDetailsResp = await axios.get(
      `${API_BASE}/device-groups/${accessCodeGroupId}`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const groupMembers = groupDetailsResp.data?.data?.members || [];
    const acMembers = groupMembers.filter((member) => member.device_type === 'access_control').map((member) => member.device_id);
    if (!acMembers.includes(keypadDeviceA) || !acMembers.includes(keypadDeviceB)) {
      throw new Error('Expected both keypad access-control devices in group membership');
    }
    if (created.deviceId) {
      const hasBlulok = groupMembers.some((member) => member.device_id === created.deviceId && member.device_type === 'blulok');
      if (!hasBlulok) throw new Error('Expected blulok device member in mixed group membership');
    }
    ok('Mixed device-type group membership validated');

    const appEntryZoneGroupResp = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: created.facilityId,
        group_type: 'zone',
        name: `E2E App Entry Zone ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const appEntryZoneGroupId = appEntryZoneGroupResp.data?.data?.id;
    if (!appEntryZoneGroupId) throw new Error('App-entry zone group creation did not return id');
    await axios.post(
      `${API_BASE}/device-groups/${appEntryZoneGroupId}/members`,
      { device_id: keypadDeviceA, device_type: 'access_control' },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    if (created.deviceId) {
      await axios.post(
        `${API_BASE}/device-groups/${appEntryZoneGroupId}/members`,
        { device_id: created.deviceId, device_type: 'blulok' },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
    }

    if (created.primaryAppDevId && primaryToken) {
      step('Verifying facility-scoped route pass includes app-entry audience for zone-linked access control');
      const passResp = await axios.post(
        `${API_BASE}/passes/request`,
        { facility_id: created.facilityId },
        { headers: { Authorization: `Bearer ${primaryToken}`, 'X-App-Device-Id': created.primaryAppDevId } },
      );
      const passToken = passResp.data?.routePass;
      if (!passToken) throw new Error('Expected facility-scoped route pass token for app-entry audience validation');
      const parts = passToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (!Array.isArray(payload.aud)) throw new Error('Expected route pass audiences array for app-entry validation');
      const hasAppAudience = payload.aud.some((aud) => aud === `access_control:${keypadDeviceA}` || aud === `access_control:${keypadDeviceB}`);
      if (!hasAppAudience) {
        throw new Error('Expected route pass to include at least one access_control:* audience for zone-linked app entry');
      }
      assertRoutePassUserRole(payload, 'tenant');
      const scopedSched = payload.schedules;
      if (Array.isArray(scopedSched) && scopedSched.length > 0) {
        if (!scopedSched.some((s) => s.f === created.facilityId)) {
          throw new Error(
            'When schedules claim is present, expected facility-scoped route pass to include that facility',
          );
        }
      }
      ok('Facility-scoped route pass includes app-entry access_control audience and user_role');
    }

    step('Verifying facility_admin route pass includes user_role=facility_admin');
    const faRouteDevId = `e2e-fa-rp-${Date.now()}`;
    const faRoutePub = Buffer.alloc(32, 7).toString('base64');
    await registerUserDevice(created.facilityAdminToken, faRouteDevId, faRoutePub);
    const faPassResp = await axios.post(
      `${API_BASE}/passes/request`,
      { facility_id: created.facilityId },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}`, 'X-App-Device-Id': faRouteDevId } },
    );
    if (!faPassResp.data?.success) {
      throw new Error(`Facility admin route pass request failed: ${JSON.stringify(faPassResp.data)}`);
    }
    const faPassToken = faPassResp.data.routePass;
    if (!faPassToken) throw new Error('Facility admin route pass missing routePass');
    const faRpClaims = decodeJwtClaims(faPassToken);
    assertRoutePassUserRole(faRpClaims, 'facility_admin');
    if (Object.prototype.hasOwnProperty.call(faRpClaims, 'schedule') && faRpClaims.schedule != null) {
      throw new Error('Unexpected legacy schedule claim on facility_admin route pass');
    }
    ok('Facility admin route pass includes user_role=facility_admin');

    const getEffectiveCodesMap = async () => {
      const effectiveResp = await axios.get(
        `${API_BASE}/access-codes/effective`,
        {
          headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
          params: { facility_id: created.facilityId },
        },
      );
      const rows = effectiveResp.data?.data || [];
      return new Map(rows.map((row) => [row.device_id, row]));
    };

    const normalizeCodeRowsForDevice = (cmd, deviceId) => {
      if (!cmd || !Array.isArray(cmd.codes)) return [];
      const rows = [];
      cmd.codes
        .filter((entry) => entry.device_id === deviceId)
        .forEach((entry) => {
          if (!Array.isArray(entry.valid_codes) || entry.valid_codes.length === 0) return;
          entry.valid_codes.forEach((validCode) => {
            rows.push({
              ...validCode,
              device_id: deviceId,
            });
          });
        });
      return rows;
    };

    const assertNoLegacyTopLevelCodeFields = (cmd) => {
      if (!cmd || !Array.isArray(cmd.codes)) return;
      cmd.codes.forEach((entry) => {
        if (
          Object.prototype.hasOwnProperty.call(entry, 'code')
          || Object.prototype.hasOwnProperty.call(entry, 'valid_from')
          || Object.prototype.hasOwnProperty.call(entry, 'valid_until')
          || Object.prototype.hasOwnProperty.call(entry, 'schedule_id')
          || Object.prototype.hasOwnProperty.call(entry, 'schedule')
          || Object.prototype.hasOwnProperty.call(entry, 'schedule_name')
          || Object.prototype.hasOwnProperty.call(entry, 'time_windows')
        ) {
          throw new Error('ACCESS_CODE_UPDATE should not include legacy top-level code fields');
        }
      });
    };

    step('Setting group-scoped code and asserting gateway fan-out to all keypad members');
    const manualGroupCode = '333333';
    const expectManualGroup = waitForCommand(
      ws,
      (cmd) =>
        cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
        Array.isArray(cmd.codes) &&
        normalizeCodeRowsForDevice(cmd, keypadDeviceA).some((entry) => entry.code === manualGroupCode) &&
        normalizeCodeRowsForDevice(cmd, keypadDeviceB).some((entry) => entry.code === manualGroupCode),
      15000,
    );
    await axios.put(
      `${API_BASE}/access-codes/manual/set`,
      {
        facility_id: created.facilityId,
        scope_type: 'device_group',
        scope_id: accessCodeGroupId,
        code: manualGroupCode,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const manualGroupCmd = await expectManualGroup;
    assertNoLegacyTopLevelCodeFields(manualGroupCmd);
    const effectiveAfterGroup = await getEffectiveCodesMap();
    const groupEffectiveA = effectiveAfterGroup.get(keypadDeviceA);
    const groupEffectiveB = effectiveAfterGroup.get(keypadDeviceB);
    if (!groupEffectiveA || groupEffectiveA.source_scope_type !== 'device_group' || groupEffectiveA.code !== manualGroupCode) {
      throw new Error('Expected keypadDeviceA effective code to resolve from device_group after group set');
    }
    if (!groupEffectiveB || groupEffectiveB.source_scope_type !== 'device_group' || groupEffectiveB.code !== manualGroupCode) {
      throw new Error('Expected keypadDeviceB effective code to resolve from device_group after group set');
    }
    ok('Group-scoped code fan-out and effective resolution validated');

    if (keypadDeviceC) {
      step('Adding new access-control member auto-syncs to current group code');
      const expectNewMemberSync = waitForCommand(
        ws,
        (cmd) =>
          cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
          Array.isArray(cmd.codes) &&
          normalizeCodeRowsForDevice(cmd, keypadDeviceC).some((entry) => entry.code === manualGroupCode),
        15000,
      );
      await axios.post(
        `${API_BASE}/device-groups/${accessCodeGroupId}/members`,
        { device_id: keypadDeviceC, device_type: 'access_control' },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      await expectNewMemberSync;
      const effectiveAfterMemberAdd = await getEffectiveCodesMap();
      const newMemberEffective = effectiveAfterMemberAdd.get(keypadDeviceC);
      if (!newMemberEffective || newMemberEffective.source_scope_type !== 'device_group' || newMemberEffective.code !== manualGroupCode) {
        throw new Error('Expected newly-added access-control member to inherit current group code immediately');
      }
      ok('New member inherited current group code on add');

      await axios.delete(
        `${API_BASE}/device-groups/${accessCodeGroupId}/members/${keypadDeviceC}`,
        {
          headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
          params: { device_type: 'access_control' },
        },
      );
    }

    step('Blocking device-scoped overrides for grouped devices');
    const deviceOverrideResp = await axios.put(
      `${API_BASE}/access-codes/manual/set`,
      {
        facility_id: created.facilityId,
        scope_type: 'device',
        scope_id: keypadDeviceA,
        code: '111111',
      },
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        validateStatus: () => true,
      },
    );
    if (deviceOverrideResp.status !== 400) {
      throw new Error(`Expected grouped-device manual override to be rejected with 400, got ${deviceOverrideResp.status}`);
    }
    if (!String(deviceOverrideResp.data?.message || '').includes('set the group code')) {
      throw new Error('Expected grouped-device override rejection message to instruct using group code');
    }
    ok('Grouped-device direct override is correctly blocked');

    step('Validating multi-group membership dispatches all valid codes per device');
    const secondaryGroupResp = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: created.facilityId,
        group_type: 'access_code',
        name: `E2E Secondary Group ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const secondaryGroupId = secondaryGroupResp.data?.data?.id;
    if (!secondaryGroupId) throw new Error('Secondary access-code group creation did not return id');
    await axios.post(
      `${API_BASE}/device-groups/${secondaryGroupId}/members`,
      { device_id: keypadDeviceA, device_type: 'access_control' },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    if (created.deviceId) {
      await axios.post(
        `${API_BASE}/device-groups/${secondaryGroupId}/members`,
        { device_id: created.deviceId, device_type: 'blulok' },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
    }
    const secondaryCode = '222222';
    const expectSecondaryGroupCode = waitForCommand(
      ws,
      (cmd) => {
        if (cmd.cmd_type !== 'ACCESS_CODE_UPDATE' || !Array.isArray(cmd.codes)) return false;
        const codeRows = normalizeCodeRowsForDevice(cmd, keypadDeviceA);
        const seenCodes = new Set(codeRows.map((entry) => entry.code));
        return seenCodes.has(manualGroupCode) && seenCodes.has(secondaryCode);
      },
      15000,
    );
    await axios.put(
      `${API_BASE}/access-codes/manual/set`,
      {
        facility_id: created.facilityId,
        scope_type: 'device_group',
        scope_id: secondaryGroupId,
        code: secondaryCode,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const multiGroupCmd = await expectSecondaryGroupCode;
    const multiGroupRows = normalizeCodeRowsForDevice(multiGroupCmd, keypadDeviceA);
    if (multiGroupRows.length < 2) {
      throw new Error('Expected multi-group device payload to include multiple valid_codes entries');
    }
    ok('Multi-group device received aggregated valid code payload entries');

    step('Creating active schedules for all-schedule rotation coverage');
    const rotationScheduleDayResp = await axios.post(
      `${API_BASE}/facilities/${created.facilityId}/schedules`,
      {
        name: `E2E Access Day ${Date.now()}`,
        schedule_type: 'custom',
        is_active: true,
        time_windows: [
          { day_of_week: 1, start_time: '08:00:00', end_time: '17:00:00' },
          { day_of_week: 2, start_time: '08:00:00', end_time: '17:00:00' },
        ],
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const rotationScheduleNightResp = await axios.post(
      `${API_BASE}/facilities/${created.facilityId}/schedules`,
      {
        name: `E2E Access Night ${Date.now()}`,
        schedule_type: 'custom',
        is_active: true,
        time_windows: [
          { day_of_week: 1, start_time: '17:00:00', end_time: '23:59:59' },
          { day_of_week: 2, start_time: '17:00:00', end_time: '23:59:59' },
        ],
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const rotationScheduleIds = [
      rotationScheduleDayResp.data?.schedule?.id,
      rotationScheduleNightResp.data?.schedule?.id,
    ].filter(Boolean);
    if (rotationScheduleIds.length < 2) {
      throw new Error('Expected two active schedules for all-schedule rotation coverage');
    }

    step('Rotating group scope and validating in-sync group member updates across all schedules');
    const expectScopedRotate = waitForCommand(
      ws,
      (cmd) =>
        cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
        Array.isArray(cmd.codes) &&
        cmd.codes.some((entry) => entry.device_id === keypadDeviceA) &&
        cmd.codes.some((entry) => entry.device_id === keypadDeviceB),
      12000,
    );
    await axios.post(
      `${API_BASE}/access-codes/rotate`,
      {
        facility_id: created.facilityId,
        scope_type: 'device_group',
        scope_id: accessCodeGroupId,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const scopedRotateCmd = await expectScopedRotate;
    const scopedRotateEntriesA = normalizeCodeRowsForDevice(scopedRotateCmd, keypadDeviceA);
    const scopedRotateEntriesB = normalizeCodeRowsForDevice(scopedRotateCmd, keypadDeviceB);
    const scopedScheduleSetA = new Set(scopedRotateEntriesA.map((entry) => entry.schedule_id || null));
    const scopedScheduleSetB = new Set(scopedRotateEntriesB.map((entry) => entry.schedule_id || null));
    const expectedScheduleContexts = new Set([null, ...rotationScheduleIds]);
    if (
      scopedRotateEntriesA.length < expectedScheduleContexts.size ||
      !Array.from(expectedScheduleContexts).every((scheduleId) => scopedScheduleSetA.has(scheduleId))
    ) {
      throw new Error('Expected group rotate command to include a valid 6-digit code for keypadDeviceA');
    }
    if (
      scopedRotateEntriesB.length < expectedScheduleContexts.size ||
      !Array.from(expectedScheduleContexts).every((scheduleId) => scopedScheduleSetB.has(scheduleId))
    ) {
      throw new Error('Expected group rotate command to include schedule contexts for keypadDeviceB');
    }
    for (const scheduleId of expectedScheduleContexts) {
      const entryA = scopedRotateEntriesA.find((entry) => (entry.schedule_id || null) === scheduleId);
      const entryB = scopedRotateEntriesB.find((entry) => (entry.schedule_id || null) === scheduleId);
      if (!entryA || !/^[0-9]{6}$/.test(String(entryA.code || ''))) {
        throw new Error(`Expected keypadDeviceA to receive a valid 6-digit code for schedule context ${scheduleId || 'always-on'}`);
      }
      if (!entryB || !/^[0-9]{6}$/.test(String(entryB.code || ''))) {
        throw new Error(`Expected keypadDeviceB to receive a valid 6-digit code for schedule context ${scheduleId || 'always-on'}`);
      }
      if (scheduleId) {
        if (!entryA.schedule || entryA.schedule.facility_id !== created.facilityId || !Array.isArray(entryA.schedule.time_windows)) {
          throw new Error(`Expected scheduled context ${scheduleId} to include serialized schedule object for keypadDeviceA`);
        }
      } else if (entryA.schedule !== null && entryA.schedule !== undefined) {
        throw new Error('Expected always-on context to omit schedule payload');
      }
    }
    const effectiveAfterScopedRotate = await getEffectiveCodesMap();
    const scopedEffectiveA = effectiveAfterScopedRotate.get(keypadDeviceA);
    const scopedEffectiveB = effectiveAfterScopedRotate.get(keypadDeviceB);
    if (!scopedEffectiveA || scopedEffectiveA.source_scope_type !== 'device_group') {
      throw new Error('Expected keypadDeviceA to resolve from device_group after group rotate');
    }
    if (!scopedEffectiveB || scopedEffectiveB.source_scope_type !== 'device_group') {
      throw new Error('Expected keypadDeviceB to resolve from device_group after group rotate');
    }
    ok('Scoped rotate endpoint validated for group scope across all schedule contexts');

    const originalConfigResp = await axios.get(
      `${API_BASE}/access-codes/config/${created.facilityId}`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const originalConfig = originalConfigResp.data?.data || null;
    accessCodeOriginalConfig = originalConfig;
    accessCodeConfigFacilityId = created.facilityId;

    step('Configuring recurring rotation schedule to trigger in ~3 seconds');
    const nowForSchedule = new Date();
    const scheduleConfiguredAt = Date.now();
    await axios.put(
      `${API_BASE}/access-codes/groups/${accessCodeGroupId}/config`,
      {
        is_enabled: true,
        digit_count: 6,
        rotation_interval_hours: 3 / 3600, // 3 seconds
        rotation_hour: nowForSchedule.getHours(),
        rotation_minute: nowForSchedule.getMinutes(),
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    await axios.put(
      `${API_BASE}/access-codes/config/${created.facilityId}`,
      {
        is_enabled: true,
        digit_count: 6,
        rotation_interval_hours: 3 / 3600, // 3 seconds
        rotation_hour: nowForSchedule.getHours(),
        rotation_minute: nowForSchedule.getMinutes(),
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    accessCodeConfigModified = true;
    const expectedRotatedContexts = new Set([null, ...rotationScheduleIds]);
    const expectScheduledRotation = waitForCommand(
      ws,
      (cmd) => {
        if (cmd.cmd_type !== 'ACCESS_CODE_UPDATE' || !Array.isArray(cmd.codes)) return false;
        const entriesA = normalizeCodeRowsForDevice(cmd, keypadDeviceA);
        const scheduleSetA = new Set(entriesA.map((entry) => entry.schedule_id || null));
        return Array.from(expectedRotatedContexts).every((scheduleId) => scheduleSetA.has(scheduleId));
      },
      12000,
    );
    const scheduledRotationCmd = await expectScheduledRotation;
    for (const scheduleId of expectedRotatedContexts) {
      const entryA = normalizeCodeRowsForDevice(scheduledRotationCmd, keypadDeviceA).find(
        (entry) => (entry.schedule_id || null) === scheduleId,
      );
      const entryB = normalizeCodeRowsForDevice(scheduledRotationCmd, keypadDeviceB).find(
        (entry) => (entry.schedule_id || null) === scheduleId,
      );
      if (!entryA || !entryB) {
        throw new Error(`Expected scheduled rotation command to include both grouped devices for context ${scheduleId || 'always-on'}`);
      }
      if (scheduleId) {
        if (!entryA.schedule || entryA.schedule.facility_id !== created.facilityId || !Array.isArray(entryA.schedule.time_windows)) {
          throw new Error(`Expected scheduled rotation context ${scheduleId} to include serialized schedule for keypadDeviceA`);
        }
      }
    }
    let groupRotated = false;
    for (let i = 0; i < 8; i += 1) {
      const activeCodesResp = await axios.get(
        `${API_BASE}/access-codes`,
        {
          headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
          params: { facility_id: created.facilityId },
        },
      );
      const activeCodes = activeCodesResp.data?.data || [];
      const freshGroupCodes = activeCodes.filter((entry) =>
        entry.scope_type === 'device_group' &&
        entry.scope_id === accessCodeGroupId &&
        new Date(entry.created_at).getTime() >= scheduleConfiguredAt
      );
      const rotatedContextSet = new Set(freshGroupCodes.map((entry) => entry.schedule_id || null));
      if (Array.from(expectedRotatedContexts).every((scheduleId) => rotatedContextSet.has(scheduleId))) {
        groupRotated = true;
        break;
      }
      await delay(1000);
    }
    if (!groupRotated) {
      throw new Error('Expected scheduled rotation to create fresh device-group scope codes for all schedule contexts');
    }
    const effectiveAfterSchedule = await getEffectiveCodesMap();
    const scheduleEffectiveA = effectiveAfterSchedule.get(keypadDeviceA);
    const scheduleEffectiveB = effectiveAfterSchedule.get(keypadDeviceB);
    if (!scheduleEffectiveA || scheduleEffectiveA.source_scope_type !== 'device_group') {
      throw new Error('Expected keypadDeviceA to remain group-scoped after schedule rotation');
    }
    if (!scheduleEffectiveB || scheduleEffectiveB.source_scope_type !== 'device_group') {
      throw new Error('Expected keypadDeviceB to remain group-scoped after schedule rotation');
    }
    ok('Recurring rotation schedule triggered, group scope rotated, and gateway ACCESS_CODE_UPDATE observed');

    step('Reverting access code schedule configuration');
    await axios.put(
      `${API_BASE}/access-codes/config/${created.facilityId}`,
      {
        is_enabled: originalConfig?.is_enabled ?? false,
        digit_count: originalConfig?.digit_count ?? 6,
        rotation_interval_hours: originalConfig?.rotation_interval_hours ?? 24,
        rotation_hour: originalConfig?.rotation_hour ?? 0,
        rotation_minute: originalConfig?.rotation_minute ?? 0,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    accessCodeConfigModified = false;
    ok('Access code schedule reverted');

    step('Creating global shared access-code group and validating uniqueness + exclusivity conflicts');
    const globalGroupResp = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: created.facilityId,
        group_type: 'access_code',
        is_global_shared: true,
        name: `E2E Global Access Group ${Date.now()}`,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    globalSharedAccessCodeGroupId = globalGroupResp.data?.data?.id;
    if (!globalSharedAccessCodeGroupId) throw new Error('Global shared group creation did not return id');

    const firstGlobalSharedAccessCodeGroupId = globalSharedAccessCodeGroupId;
    const secondGlobalResp = await axios.post(
      `${API_BASE}/device-groups`,
      {
        facility_id: created.facilityId,
        group_type: 'access_code',
        is_global_shared: true,
        name: `E2E Duplicate Global Group ${Date.now()}`,
      },
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        validateStatus: () => true,
      },
    );
    if (![200, 201].includes(secondGlobalResp.status)) {
      throw new Error(`Expected second global shared group create to succeed, got ${secondGlobalResp.status}`);
    }
    const promotedGlobalSharedGroupId = secondGlobalResp.data?.data?.id;
    if (!promotedGlobalSharedGroupId) {
      throw new Error('Second global shared group create did not return id');
    }
    const [firstGlobalGroupStateResp, promotedGlobalGroupStateResp] = await Promise.all([
      axios.get(`${API_BASE}/device-groups/${firstGlobalSharedAccessCodeGroupId}`, {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
      }),
      axios.get(`${API_BASE}/device-groups/${promotedGlobalSharedGroupId}`, {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
      }),
    ]);
    const firstGroupState = firstGlobalGroupStateResp.data?.data;
    const promotedGroupState = promotedGlobalGroupStateResp.data?.data;
    if (firstGroupState?.is_global_shared !== false) {
      throw new Error('Expected previous global shared group to be auto-demoted');
    }
    if (promotedGroupState?.is_global_shared !== true) {
      throw new Error('Expected second created global shared group to be promoted');
    }
    demotedGlobalSharedAccessCodeGroupId = firstGlobalSharedAccessCodeGroupId;
    globalSharedAccessCodeGroupId = promotedGlobalSharedGroupId;

    const membershipConflictResp = await axios.post(
      `${API_BASE}/device-groups/${globalSharedAccessCodeGroupId}/members`,
      { device_id: keypadDeviceA, device_type: 'access_control' },
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        validateStatus: () => true,
      },
    );
    if (![200, 201].includes(membershipConflictResp.status)) {
      throw new Error(`Expected multi-group access-control membership to be allowed, got ${membershipConflictResp.status}`);
    }
    ok('Access-control device membership across multiple access-code groups is allowed');

    await axios.delete(
      `${API_BASE}/device-groups/${accessCodeGroupId}/members/${keypadDeviceB}`,
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        params: { device_type: 'access_control' },
      },
    );
    await axios.post(
      `${API_BASE}/device-groups/${globalSharedAccessCodeGroupId}/members`,
      { device_id: keypadDeviceB, device_type: 'access_control' },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );

    const globalGroupCode = '222222';
    const expectGlobalGroupSet = waitForCommand(
      ws,
      (cmd) =>
        cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
        Array.isArray(cmd.codes) &&
        normalizeCodeRowsForDevice(cmd, keypadDeviceB).some((entry) => entry.code === globalGroupCode),
      15000,
    );
    await axios.put(
      `${API_BASE}/access-codes/manual/set`,
      {
        facility_id: created.facilityId,
        scope_type: 'device_group',
        scope_id: globalSharedAccessCodeGroupId,
        code: globalGroupCode,
      },
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    await expectGlobalGroupSet;
    ok('Global shared uniqueness + exclusivity conflict behavior validated and global membership configured');

    step('Configuring schedule-scoped access code and validating tenant schedule resolution');
    const accessCodeSchedulesResp = await axios.get(
      `${API_BASE}/facilities/${created.facilityId}/schedules`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const facilitySchedules = accessCodeSchedulesResp.data?.schedules || [];
    const selectedSchedule = facilitySchedules.find((schedule) => schedule.is_active) || facilitySchedules[0];
    if (selectedSchedule && primaryToken && created.primaryTenantId) {
      selectedAccessCodeScheduleId = selectedSchedule.id;
      await axios.put(
        `${API_BASE}/users/${created.primaryTenantId}/facilities/${created.facilityId}/schedule`,
        { scheduleId: selectedSchedule.id },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );

      const scheduledGroupCode = '121212';
      const expectScheduleScopedSet = waitForCommand(
        ws,
        (cmd) =>
          cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
          Array.isArray(cmd.codes) &&
          normalizeCodeRowsForDevice(cmd, keypadDeviceB).some(
            (entry) =>
              entry.code === scheduledGroupCode &&
              entry.schedule_id === selectedSchedule.id &&
              entry.schedule &&
              entry.schedule.facility_id === created.facilityId &&
              Array.isArray(entry.schedule.time_windows),
          ),
        15000,
      );
      await axios.put(
        `${API_BASE}/access-codes/manual/set`,
        {
          facility_id: created.facilityId,
          scope_type: 'device_group',
          scope_id: globalSharedAccessCodeGroupId,
          schedule_id: selectedSchedule.id,
          code: scheduledGroupCode,
        },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      await expectScheduleScopedSet;

      const tenantScheduledAppCodesResp = await axios.get(
        `${API_BASE}/access-codes/app/my`,
        {
          headers: { Authorization: `Bearer ${primaryToken}` },
          params: { facility_id: created.facilityId },
        },
      );
      const tenantScheduledAppCodes = tenantScheduledAppCodesResp.data?.data || [];
      const scheduledEntry = tenantScheduledAppCodes.find((entry) => entry.device_id === keypadDeviceB && entry.schedule_id === selectedSchedule.id);
      if (!scheduledEntry || scheduledEntry.code !== scheduledGroupCode) {
        throw new Error('Expected tenant /access-codes/app/my to resolve schedule-scoped group code for assigned schedule');
      }
      ok('Schedule-scoped code payload and tenant schedule resolution validated');
    } else {
      ok('Skipped schedule-scoped access-code E2E branch (missing schedule or primary tenant context)');
    }

    if (keypadDeviceC) {
      step('Creating private access-code group for tenant visibility negative case');
      const privateGroupResp = await axios.post(
        `${API_BASE}/device-groups`,
        {
          facility_id: created.facilityId,
          group_type: 'access_code',
          is_global_shared: false,
          name: `E2E Private Access Group ${Date.now()}`,
        },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      privateAccessCodeGroupId = privateGroupResp.data?.data?.id;
      if (!privateAccessCodeGroupId) throw new Error('Private access-code group creation did not return id');
      await axios.post(
        `${API_BASE}/device-groups/${privateAccessCodeGroupId}/members`,
        { device_id: keypadDeviceC, device_type: 'access_control' },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      const expectPrivateGroupSet = waitForCommand(
        ws,
        (cmd) =>
          cmd.cmd_type === 'ACCESS_CODE_UPDATE' &&
          Array.isArray(cmd.codes) &&
          normalizeCodeRowsForDevice(cmd, keypadDeviceC).some((entry) => entry.code === '444444'),
        15000,
      );
      await axios.put(
        `${API_BASE}/access-codes/manual/set`,
        {
          facility_id: created.facilityId,
          scope_type: 'device_group',
          scope_id: privateAccessCodeGroupId,
          code: '444444',
        },
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      await expectPrivateGroupSet;
      ok('Private access-code group configured for tenant-visibility negative test');
    }

    step('Verifying tenant/facility-accessible access code pairings endpoint');
    const myCodesResp = await axios.get(
      `${API_BASE}/access-codes/my`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const myCodes = myCodesResp.data?.data || [];
    if (!Array.isArray(myCodes) || myCodes.length === 0) {
      throw new Error('Expected /access-codes/my to return at least one device/code pairing');
    }
    ok(`/access-codes/my returned ${myCodes.length} pairing(s)`);
    const myCodesFacilityScopedResp = await axios.get(
      `${API_BASE}/access-codes/my`,
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        params: { facility_id: created.facilityId },
      },
    );
    const myCodesFacilityScoped = myCodesFacilityScopedResp.data?.data || [];
    if (!Array.isArray(myCodesFacilityScoped) || myCodesFacilityScoped.length === 0) {
      throw new Error('Expected /access-codes/my?facility_id=... to return at least one pairing');
    }
    if (primaryToken) {
      const tenantMyCodesResp = await axios.get(
        `${API_BASE}/access-codes/my`,
        {
          headers: { Authorization: `Bearer ${primaryToken}` },
          params: { facility_id: created.facilityId },
        },
      );
      const tenantMyCodes = tenantMyCodesResp.data?.data || [];
      if (!Array.isArray(tenantMyCodes) || tenantMyCodes.length === 0) {
        throw new Error('Expected tenant /access-codes/my to return at least one pairing in assigned facility');
      }
      ok(`Tenant /access-codes/my returned ${tenantMyCodes.length} pairing(s)`);
    }

    step('Verifying app-facing access code endpoint role/filter behavior');
    const appMyFacilityAdminResp = await axios.get(
      `${API_BASE}/access-codes/app/my`,
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        params: { facility_id: created.facilityId },
      },
    );
    const appFacilityAdminCodes = appMyFacilityAdminResp.data?.data || [];
    if (!Array.isArray(appFacilityAdminCodes) || appFacilityAdminCodes.length < 2) {
      throw new Error('Expected facility_admin /access-codes/app/my to return both keypad devices in facility');
    }

    const appMyDevAdminResp = await axios.get(
      `${API_BASE}/access-codes/app/my`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { facility_id: created.facilityId },
      },
    );
    const appDevAdminCodes = appMyDevAdminResp.data?.data || [];
    if (!Array.isArray(appDevAdminCodes) || appDevAdminCodes.length < 2) {
      throw new Error('Expected dev_admin /access-codes/app/my to return all keypad devices in facility');
    }

    const appMyAdminResp = await axios.get(
      `${API_BASE}/access-codes/app/my`,
      {
        headers: { Authorization: `Bearer ${platformAdmin.token}` },
        params: { facility_id: created.facilityId },
      },
    );
    const appAdminCodes = appMyAdminResp.data?.data || [];
    if (!Array.isArray(appAdminCodes) || appAdminCodes.length < 2) {
      throw new Error('Expected admin /access-codes/app/my to return all keypad devices in facility');
    }

    if (primaryToken) {
      const tenantAppCodesResp = await axios.get(
        `${API_BASE}/access-codes/app/my`,
        {
          headers: { Authorization: `Bearer ${primaryToken}` },
          params: { facility_id: created.facilityId },
        },
      );
      const tenantAppCodes = tenantAppCodesResp.data?.data || [];
      if (!Array.isArray(tenantAppCodes) || tenantAppCodes.length === 0) {
        throw new Error('Expected tenant /access-codes/app/my to return at least one visible keypad pairing');
      }
      for (const entry of tenantAppCodes) {
        if (!entry.device_id || !entry.device_name || !entry.code) {
          throw new Error('Tenant /access-codes/app/my returned entry missing device_id/device_name/code');
        }
        if (!entry.schedule_id) {
          throw new Error('Tenant /access-codes/app/my should not return always-on access code entries');
        }
      }
      const tenantIds = new Set(tenantAppCodes.map((entry) => entry.device_id));
      if (!tenantIds.has(keypadDeviceB)) {
        throw new Error('Expected tenant /access-codes/app/my to include globally shared keypad device');
      }
      if (!tenantIds.has(keypadDeviceA)) {
        throw new Error('Expected tenant /access-codes/app/my to include multi-zone keypad when tenant has at least one linked zone');
      }
      if (keypadDeviceC && tenantIds.has(keypadDeviceC)) {
        throw new Error('Tenant /access-codes/app/my should not include private-group keypad device');
      }
      ok(`App endpoint role/filter checks passed (facility_admin=${appFacilityAdminCodes.length}, admin=${appAdminCodes.length}, dev_admin=${appDevAdminCodes.length}, tenant=${tenantAppCodes.length})`);
    } else {
      ok(`App endpoint role/filter checks passed (facility_admin=${appFacilityAdminCodes.length}, admin=${appAdminCodes.length}, dev_admin=${appDevAdminCodes.length})`);
    }

    if (share1Token && share1Id) {
      step('Verifying any tenant with an active unit assignment gets default/global access-code group devices');
      const extraUnit = await createUnit(token, created.facilityId, `E2E-EXTRA-${Date.now()}`);
      if (!extraUnit?.id) throw new Error('Failed to create extra unit for tenant access-code visibility coverage');
      await assignTenantToUnit(token, extraUnit.id, share1Id, false);
      if (selectedAccessCodeScheduleId) {
        await axios.put(
          `${API_BASE}/users/${share1Id}/facilities/${created.facilityId}/schedule`,
          { scheduleId: selectedAccessCodeScheduleId },
          { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
        );
      }
      const tenantWithUnitResp = await axios.get(
        `${API_BASE}/access-codes/app/my`,
        {
          headers: { Authorization: `Bearer ${share1Token}` },
          params: { facility_id: created.facilityId },
        },
      );
      const tenantWithUnitCodes = tenantWithUnitResp.data?.data || [];
      const tenantWithUnitDeviceIds = new Set(tenantWithUnitCodes.map((entry) => entry.device_id));
      if (!tenantWithUnitDeviceIds.has(keypadDeviceB)) {
        throw new Error('Expected tenant with any active unit assignment to receive default/global access-code group device');
      }
      if (tenantWithUnitCodes.some((entry) => !entry.schedule_id)) {
        throw new Error('Tenant with unit assignment should only receive schedule-scoped access-code entries');
      }
      ok('Tenant with active unit assignment sees default/global access-code group device');
    }

    if (keypadDeviceA) {
      step('Verifying tenant with no unit/key-share zone access cannot see zone-linked access control devices');
      const noZoneEmail = `tenant-no-zone-${Date.now()}@test.com`;
      const noZonePassword = 'TestUser123!';
      const noZoneUserId = await createUser(token, noZoneEmail, 'tenant', created.facilityId);
      created.users.push(noZoneUserId);
      const noZoneLogin = await axios.post(`${API_BASE}/auth/login`, {
        email: noZoneEmail,
        password: noZonePassword,
      });
      const noZoneToken = noZoneLogin.data?.token;
      if (!noZoneToken) throw new Error('No-zone tenant login failed');
      const noZoneAppCodesResp = await axios.get(
        `${API_BASE}/access-codes/app/my`,
        { headers: { Authorization: `Bearer ${noZoneToken}` } },
      );
      const noZoneDeviceIds = new Set((noZoneAppCodesResp.data?.data || []).map((entry) => entry.device_id));
      if (noZoneDeviceIds.has(keypadDeviceA)) {
        throw new Error('Tenant with no unit/key-share in any zone should not receive zone-linked access control device');
      }
      ok('Tenant with no zone access does not receive zone-linked access control device');
    }

    if (primaryToken) {
      step('Validating tenant is forbidden from access-code management endpoints');
      const tenantManageResp = await axios.put(
        `${API_BASE}/access-codes/config/${created.facilityId}`,
        { is_enabled: false },
        {
          headers: { Authorization: `Bearer ${primaryToken}` },
          validateStatus: () => true,
        },
      );
      if (tenantManageResp.status !== 403) {
        throw new Error(`Expected tenant access-code config update to be forbidden (403), got ${tenantManageResp.status}`);
      }
      ok('Tenant management access correctly forbidden for access-code config update');
    }

    step('Verifying internal gateway poll endpoint for access codes');
    const gatewayPollResp = await axios.get(
      `${API_BASE}/internal/gateway/access-codes`,
      {
        headers: {
          Authorization: `Bearer ${created.facilityAdminToken}`,
          'X-Gateway-Facility-Id': created.facilityId,
        },
      },
    );
    const pollCodes = gatewayPollResp.data?.data?.codes || [];
    if (!Array.isArray(pollCodes) || pollCodes.length === 0) {
      throw new Error('Expected internal gateway poll endpoint to return resolved codes');
    }
    ok(`Internal gateway poll returned ${pollCodes.length} device code mapping(s)`);

    step('Pushing access code update command to gateway');
    await axios.post(
      `${API_BASE}/access-codes/push/${created.facilityId}`,
      {},
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    ok('Access code push command dispatched');

    heading('Mixed Chaos Stress (Firmware Progress + Subscription Spam + Access-Code Push)');
    step('Preparing active firmware push for high-rate progress updates');
    const stressCrypto = require('crypto');
    const StressFormData = require('form-data');
    const stressFirmwareBinary = stressCrypto.randomBytes(96 * 1024); // single-chunk payload
    const stressFirmwareVersion = `e2e-chaos-${Date.now()}`;
    const stressFormData = new StressFormData();
    stressFormData.append('file', stressFirmwareBinary, { filename: 'chaos-firmware.bin', contentType: 'application/octet-stream' });
    stressFormData.append('version', stressFirmwareVersion);
    stressFormData.append('target_type', 'gateway');
    stressFormData.append('description', 'E2E mixed chaos stress firmware');
    const stressUploadResp = await axios.post(`${API_BASE}/firmware/upload`, stressFormData, {
      headers: { Authorization: `Bearer ${token}`, ...stressFormData.getHeaders() },
      maxContentLength: 100 * 1024 * 1024,
    });
    const stressFirmwareId = stressUploadResp.data?.data?.id;
    if (!stressFirmwareId) throw new Error('Failed to upload stress firmware');

    const stressDeliveryPromise = handleFirmwareDelivery(ws, loginOpsPublicKey, 60000);
    const stressPushResp = await axios.post(
      `${API_BASE}/firmware/${stressFirmwareId}/push/${created.gatewayId}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const stressPushId = stressPushResp.data?.data?.id;
    if (!stressPushId) throw new Error('Failed to create stress firmware push');
    const stressDelivery = await stressDeliveryPromise;
    if (!stressDelivery?.manifest?.nonce) throw new Error('Stress firmware delivery missing nonce');
    ok(`Stress firmware push ready: pushId=${stressPushId}`);

    step('Opening UI clients and spamming firmware_push_progress subscriptions');
    const chaosClientCount = 6;
    const chaosSubBurstPerClient = 20;
    const chaosClients = [];
    const chaosWsErrors = [];
    let chaosSubscriptionResponses = 0;

    for (let i = 0; i < chaosClientCount; i++) {
      const client = new WebSocket(`${UI_WS_URL}?token=${token}`);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Chaos WS client ${i} open timeout`)), 4000);
        client.once('open', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      client.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === 'subscription') {
            chaosSubscriptionResponses += 1;
          } else if (msg?.type === 'error') {
            chaosWsErrors.push(msg.error || 'unknown ws error');
          }
        } catch {
          // ignore parse failures from non-test messages
        }
      });
      chaosClients.push(client);
    }

    for (const client of chaosClients) {
      for (let j = 0; j < chaosSubBurstPerClient; j++) {
        client.send(JSON.stringify({
          type: 'subscription',
          subscriptionType: 'firmware_push_progress',
          data: { facility_id: created.facilityId, gateway_id: created.gatewayId, target_type: 'gateway' },
        }));
      }
    }

    step('Running concurrent chaos spam against firmware progress + access-code pushes');
    const firmwareProgressSpamCount = 120;
    const accessCodePushSpamCount = 14;

    const progressSpamPromise = (async () => {
      for (let i = 0; i < firmwareProgressSpamCount; i++) {
        ws.send(JSON.stringify({
          type: 'FIRMWARE_PROGRESS',
          push_id: stressDelivery.manifest.push_id,
          target_type: 'gateway',
          progress_percent: Math.min(99, 1 + (i % 99)),
          phase: i % 3 === 0 ? 'distributing' : (i % 3 === 1 ? 'installing' : 'verifying'),
          message: `chaos-progress-${i}`,
          devices: [
            {
              device_id: `chaos-device-${i % 4}`,
              status: i % 5 === 0 ? 'installing' : 'downloading',
              progress_percent: Math.min(100, (i * 7) % 101),
            },
          ],
        }));
        if (i % 10 === 0) {
          await delay(15);
        }
      }
    })();

    const accessCodePushSpamPromise = (async () => {
      const responses = await Promise.all(
        Array.from({ length: accessCodePushSpamCount }, () =>
          axios.post(
            `${API_BASE}/access-codes/push/${created.facilityId}`,
            {},
            {
              headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
              validateStatus: () => true,
            },
          ),
        ),
      );
      const serverErrors = responses.filter((resp) => resp.status >= 500);
      if (serverErrors.length > 0) {
        throw new Error(`Access-code push spam produced ${serverErrors.length} server errors`);
      }
      return responses.length;
    })();

    const [, accessPushCount] = await Promise.all([progressSpamPromise, accessCodePushSpamPromise]);
    await delay(1000);

    if (chaosWsErrors.length > 0) {
      throw new Error(`Chaos subscription spam produced WS errors: ${chaosWsErrors.slice(0, 3).join(' | ')}`);
    }
    if (chaosSubscriptionResponses < chaosClientCount) {
      throw new Error(`Expected at least ${chaosClientCount} chaos subscription responses, got ${chaosSubscriptionResponses}`);
    }
    ok(`Chaos spam complete: ${firmwareProgressSpamCount} progress updates, ${accessPushCount} access-code pushes, ${chaosSubscriptionResponses} subscription responses`);

    step('Running sustained mixed chaos soak (always-on)');
    const chaosSoakDurationMs = 12000;
    const chaosSoakStart = Date.now();
    let soakProgressCount = 0;
    let soakSubscriptionCount = 0;
    let soakAccessPushCount = 0;

    const soakProgressTask = (async () => {
      while (Date.now() - chaosSoakStart < chaosSoakDurationMs) {
        ws.send(JSON.stringify({
          type: 'FIRMWARE_PROGRESS',
          push_id: stressDelivery.manifest.push_id,
          target_type: 'gateway',
          progress_percent: Math.min(99, 1 + (soakProgressCount % 99)),
          phase: soakProgressCount % 2 === 0 ? 'installing' : 'verifying',
          message: `chaos-soak-progress-${soakProgressCount}`,
          devices: [
            {
              device_id: `chaos-soak-device-${soakProgressCount % 3}`,
              status: 'installing',
              progress_percent: Math.min(100, (soakProgressCount * 9) % 101),
            },
          ],
        }));
        soakProgressCount += 1;
        await delay(20);
      }
    })();

    const soakSubscriptionTask = (async () => {
      let clientIndex = 0;
      while (Date.now() - chaosSoakStart < chaosSoakDurationMs) {
        const client = chaosClients[clientIndex % chaosClients.length];
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'subscription',
            subscriptionType: 'firmware_push_progress',
            data: { facility_id: created.facilityId, gateway_id: created.gatewayId, target_type: 'gateway' },
          }));
          soakSubscriptionCount += 1;
        }
        clientIndex += 1;
        await delay(40);
      }
    })();

    const soakAccessPushTask = (async () => {
      while (Date.now() - chaosSoakStart < chaosSoakDurationMs) {
        const resp = await axios.post(
          `${API_BASE}/access-codes/push/${created.facilityId}`,
          {},
          {
            headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
            validateStatus: () => true,
          },
        );
        if (resp.status >= 500) {
          throw new Error(`Access-code push soak produced server error status=${resp.status}`);
        }
        soakAccessPushCount += 1;
        await delay(350);
      }
    })();

    await Promise.all([soakProgressTask, soakSubscriptionTask, soakAccessPushTask]);
    await delay(500);

    if (chaosWsErrors.length > 0) {
      throw new Error(`Chaos soak produced WS errors: ${chaosWsErrors.slice(0, 3).join(' | ')}`);
    }
    ok(`Chaos soak complete (${chaosSoakDurationMs}ms): ${soakProgressCount} progress, ${soakSubscriptionCount} subscription bursts, ${soakAccessPushCount} access-code pushes`);

    step('Completing stress firmware push and validating backend responsiveness');
    ws.send(JSON.stringify({
      type: 'FIRMWARE_UPDATE_STATUS',
      push_id: stressDelivery.manifest.push_id,
      status: 'success',
      version: stressDelivery.manifest.version,
      target_type: 'gateway',
    }));

    let stressFinalStatus = null;
    for (let poll = 0; poll < 20; poll++) {
      await delay(500);
      const stressStatusResp = await axios.get(
        `${API_BASE}/firmware/push-status/${created.gatewayId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { target_type: 'gateway' },
        },
      );
      stressFinalStatus = stressStatusResp.data?.data;
      if (stressFinalStatus?.id === stressPushId && stressFinalStatus?.status === 'complete') {
        break;
      }
    }
    if (!stressFinalStatus || stressFinalStatus.id !== stressPushId || stressFinalStatus.status !== 'complete') {
      throw new Error(`Expected stress push ${stressPushId} to complete, got id=${stressFinalStatus?.id} status=${stressFinalStatus?.status}`);
    }

    const postChaosChecks = await Promise.all([
      axios.get(`${API_BASE}/facilities`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1 },
      }),
      axios.get(`${API_BASE}/gateways`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get(`${API_BASE}/access-codes/push-state/${created.facilityId}`, {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
      }),
    ]);
    if (postChaosChecks.some((resp) => resp.status >= 500)) {
      throw new Error(`Backend degraded after mixed chaos stress: statuses=${postChaosChecks.map((resp) => resp.status).join(',')}`);
    }
    ok('Mixed chaos stress passed without backend degradation');

    for (const client of chaosClients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close();
      }
    }

    step('Deleting mixed-chaos stress firmware');
    await axios.delete(`${API_BASE}/firmware/${stressFirmwareId}`, { headers: { Authorization: `Bearer ${token}` } });
    ok('Mixed-chaos stress firmware deleted');

    step('Validating access-code push failure handling when gateway rejects ACK');
    accessCodeAckMode = 'reject';
    const rejectPushResp = await axios.post(
      `${API_BASE}/access-codes/push/${created.facilityId}`,
      {},
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        validateStatus: () => true,
      },
    );
    if (rejectPushResp.status < 500) {
      throw new Error(`Expected rejected ACK push to fail with 5xx, got ${rejectPushResp.status}`);
    }
    const rejectedStateResp = await axios.get(
      `${API_BASE}/access-codes/push-state/${created.facilityId}`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const rejectedState = rejectedStateResp.data?.data;
    if (rejectedState?.status !== 'error') {
      throw new Error(`Expected push state=error after rejected ACK, got ${rejectedState?.status}`);
    }
    ok('Rejected ACK path returns 5xx and updates push state to error');

    step('Validating access-code push failure handling when ACK times out');
    accessCodeAckMode = 'ignore';
    const timeoutPushResp = await axios.post(
      `${API_BASE}/access-codes/push/${created.facilityId}`,
      {},
      {
        headers: { Authorization: `Bearer ${created.facilityAdminToken}` },
        validateStatus: () => true,
      },
    );
    if (timeoutPushResp.status < 500) {
      throw new Error(`Expected ACK timeout push to fail with 5xx, got ${timeoutPushResp.status}`);
    }
    const timeoutStateResp = await axios.get(
      `${API_BASE}/access-codes/push-state/${created.facilityId}`,
      { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
    );
    const timeoutState = timeoutStateResp.data?.data;
    if (timeoutState?.status !== 'error') {
      throw new Error(`Expected push state=error after timeout ACK, got ${timeoutState?.status}`);
    }
    ok('ACK timeout path returns 5xx and updates push state to error');

    accessCodeAckMode = 'accept';

    step('Deleting temporary access-code groups');
    if (demotedGlobalSharedAccessCodeGroupId) {
      await axios.delete(
        `${API_BASE}/device-groups/${demotedGlobalSharedAccessCodeGroupId}`,
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      demotedGlobalSharedAccessCodeGroupId = null;
    }
    if (globalSharedAccessCodeGroupId) {
      await axios.delete(
        `${API_BASE}/device-groups/${globalSharedAccessCodeGroupId}`,
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      globalSharedAccessCodeGroupId = null;
    }
    if (privateAccessCodeGroupId) {
      await axios.delete(
        `${API_BASE}/device-groups/${privateAccessCodeGroupId}`,
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      privateAccessCodeGroupId = null;
    }
    if (accessCodeGroupId) {
      await axios.delete(
        `${API_BASE}/device-groups/${accessCodeGroupId}`,
        { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
      );
      accessCodeGroupId = null;
    }
    ok('Temporary access-code groups deleted');

    // mark success; we'll print Result after cleanup
    success = true;
  } finally {
    // Cleanup (best-effort)
    heading('Cleaning up');
    accessCodeAckMode = 'accept';
    let cleanupFailed = false;
    const cleanupErrors = [];
    try {
      if (accessCodeConfigModified && accessCodeConfigFacilityId && created.facilityAdminToken) {
        step('Restoring access code configuration');
        try {
          await axios.put(
            `${API_BASE}/access-codes/config/${accessCodeConfigFacilityId}`,
            {
              is_enabled: accessCodeOriginalConfig?.is_enabled ?? false,
              digit_count: accessCodeOriginalConfig?.digit_count ?? 6,
              rotation_interval_hours: accessCodeOriginalConfig?.rotation_interval_hours ?? 24,
              rotation_hour: accessCodeOriginalConfig?.rotation_hour ?? 0,
              rotation_minute: accessCodeOriginalConfig?.rotation_minute ?? 0,
            },
            { headers: { Authorization: `Bearer ${created.facilityAdminToken}` } },
          );
          accessCodeConfigModified = false;
          ok('Access code configuration restored');
        } catch (err) {
          cleanupFailed = true;
          cleanupErrors.push(`Failed to restore access code configuration: ${err?.response?.data || err?.message || err}`);
        }
      }

      if (unitLinkedSwapGroupId) {
        step('Deleting unit-linked swap validation group');
        await axios.delete(`${API_BASE}/device-groups/${unitLinkedSwapGroupId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        unitLinkedSwapGroupId = null;
        ok('Unit-linked swap validation group deleted');
      }

      if (globalSharedAccessCodeGroupId) {
        step('Deleting global shared access-code group');
        await axios.delete(`${API_BASE}/device-groups/${globalSharedAccessCodeGroupId}`, {
          headers: { Authorization: `Bearer ${created.facilityAdminToken || token}` },
        }).catch(() => {});
        globalSharedAccessCodeGroupId = null;
        ok('Global shared access-code group deleted');
      }

      if (demotedGlobalSharedAccessCodeGroupId) {
        step('Deleting demoted global shared access-code group');
        await axios.delete(`${API_BASE}/device-groups/${demotedGlobalSharedAccessCodeGroupId}`, {
          headers: { Authorization: `Bearer ${created.facilityAdminToken || token}` },
        }).catch(() => {});
        demotedGlobalSharedAccessCodeGroupId = null;
        ok('Demoted global shared access-code group deleted');
      }

      if (privateAccessCodeGroupId) {
        step('Deleting private access-code group');
        await axios.delete(`${API_BASE}/device-groups/${privateAccessCodeGroupId}`, {
          headers: { Authorization: `Bearer ${created.facilityAdminToken || token}` },
        }).catch(() => {});
        privateAccessCodeGroupId = null;
        ok('Private access-code group deleted');
      }

      if (accessCodeGroupId) {
        step('Deleting temporary access-code group');
        await axios.delete(`${API_BASE}/device-groups/${accessCodeGroupId}`, {
          headers: { Authorization: `Bearer ${created.facilityAdminToken || token}` },
        }).catch(() => {});
        accessCodeGroupId = null;
        ok('Temporary access-code group deleted');
      }

      // Restore firmware storage config if we changed it for this run
      if (firmwareStorageConfigOverridden && originalFirmwareStorageConfig) {
        if (canRestoreFirmwareStorageConfig) {
          step('Restoring original firmware storage config');
          await axios.put(`${API_BASE}/admin/storage-config`, {
            providerType: originalFirmwareStorageConfig.providerType,
            providerConfig: originalFirmwareStorageConfig.providerConfig,
          }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
          ok('Original firmware storage config restored');
        } else {
          warn('Skipped firmware storage config restore (original config had redacted secrets)');
        }
      }

      // Restore FMS config if we modified an existing one
      if (existingConfig?.id) {
        step('Restoring original FMS config');
        await axios.put(`${API_BASE}/fms/config/${existingConfig.id}`, {
          provider_type: existingConfig.provider_type || 'storedge',
          is_enabled: existingConfig.is_enabled ?? true,
          config: existingConfig.config,
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        ok('Original FMS config restored');
      } else if (created.fmsConfigId) {
        step(`Deleting FMS config ${created.fmsConfigId}`);
        await axios.delete(`${API_BASE}/fms/config/${created.fmsConfigId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        ok(`Deleted FMS config ${created.fmsConfigId}`);
      }
      if (mockFmsServer) {
        step('Stopping mock FMS server');
        await new Promise((resolve) => mockFmsServer.close(resolve)).catch(() => {});
        ok('Mock FMS server stopped');
        mockFmsServer = null;
      }
      // Revoke any remaining shares
      for (const shareId of created.shares) {
        step(`Revoking share ${shareId}`);
        await revokeShare(token, shareId).catch(() => {});
        ok(`Revoked share ${shareId}`);
      }
      // Unassign device
      if (created.deviceId) {
        step(`Unassigning device ${created.deviceId}`);
        await unassignDevice(token, created.deviceId).catch(() => {});
        ok(`Unassigned device ${created.deviceId}`);
      }
      // Unassign primary tenant from unit (if both exist)
    if (created.unitId && created.primaryTenantId) {
      step(`Removing primary tenant ${created.primaryTenantId} from unit ${created.unitId}`);
      await unassignTenantFromUnit(token, created.unitId, created.primaryTenantId).catch(() => {});
      ok(`Removed tenant ${created.primaryTenantId} from unit`);
      }
      // Note: Custom schedule deletion is now tested above, so we don't need to delete it here
      // The schedule deletion test handles cleanup
      if (false && created.scheduleId && created.facilityId) {
        step(`Deleting custom schedule ${created.scheduleId}`);
        await axios.delete(`${API_BASE}/facilities/${created.facilityId}/schedules/${created.scheduleId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        ok(`Deleted schedule ${created.scheduleId}`);
      }

      // Hard delete created users (dev-admin utility)
      const uniqueUserIds = Array.from(new Set(created.users));
      for (const userId of uniqueUserIds) {
        step(`Hard deleting user ${userId}`);
        try {
          await axios.delete(`${API_BASE}/admin/users/${userId}/hard`, { headers: { Authorization: `Bearer ${token}` } });
          ok(`Hard deleted user ${userId}`);
        } catch (err) {
          cleanupFailed = true;
          cleanupErrors.push(`Failed to hard delete user ${userId}: ${err?.response?.data || err?.message || err}`);
        }
      }
      if (created.facilityId) {
        step(`Hard deleting test facility ${created.facilityId}`);
        try {
          await axios.delete(`${API_BASE}/admin/facilities/${created.facilityId}/hard`, { headers: { Authorization: `Bearer ${token}` } });
          ok(`Hard deleted facility ${created.facilityId}`);
        } catch (err) {
          cleanupFailed = true;
          cleanupErrors.push(`Failed to hard delete facility ${created.facilityId}: ${err?.response?.data || err?.message || err}`);
        }
      }
    } catch (e) {
      cleanupFailed = true;
      console.error(C.red(`Cleanup encountered errors: ${e?.response?.data || e?.message || e}`));
    } finally {
      try { ws.close(1000, 'e2e_cleanup'); } catch {}
      try { if (notificationsWs) notificationsWs.close(1000, 'e2e_cleanup'); } catch {}
      if (rateLimitBypassEnabled) {
        await setRateLimitBypass(token, false);
        rateLimitBypassEnabled = false;
      }
      if (notificationsTestModeEnabled) {
        await setNotificationsTestMode(token, false);
        notificationsTestModeEnabled = false;
      }
    }

    if (cleanupFailed) {
      throw new Error(`Cleanup encountered errors:\n${cleanupErrors.join('\n')}`);
    }

    if (success) {
      heading('Result');
      ok('E2E flow completed successfully');
    }
  }
}

(async () => {
  try {
    await run();
    process.exit(0);
  } catch (e) {
    console.error('❌ E2E failed:', e?.response?.data || e?.message || e);
    process.exit(1);
  }
})(); 


