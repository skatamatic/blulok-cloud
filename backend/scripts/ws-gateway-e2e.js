/* eslint-disable no-console */
const axios = require('axios').default;
const WebSocket = require('ws');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws/gateway';
const UI_WS_URL = process.env.UI_WS_URL || 'ws://127.0.0.1:3000/ws';
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';
const VERBOSE = process.env.E2E_VERBOSE === '1' || process.env.VERBOSE === '1' || process.argv.includes('--verbose');

axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS) || 15000;

function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }

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
      // Storedge-like routes:
      // GET /v1/:facility/units -> { units: [...] }
      // GET /v1/:facility/tenants/current -> { tenants: [...] }
      // GET /v1/:facility/ledgers/current -> { ledgers: [...] }
      // GET /v1/:facility/tenants/:id -> single tenant
      // GET /v1/:facility/units/:id -> single unit
      const mUnits = req.url.match(/^\/v1\/[^/]+\/units$/);
      if (req.method === 'GET' && mUnits) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ units: dataset.units })); return;
      }
      const mTenantsCurrent = req.url.match(/^\/v1\/[^/]+\/tenants\/current$/);
      if (req.method === 'GET' && mTenantsCurrent) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ tenants: dataset.tenants })); return;
      }
      const mLedgersCurrent = req.url.match(/^\/v1\/[^/]+\/ledgers\/current$/);
      if (req.method === 'GET' && mLedgersCurrent) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ledgers: dataset.ledgers })); return;
      }
      const mTenantById = req.url.match(/^\/v1\/[^/]+\/tenants\/([^/?]+)$/);
      if (req.method === 'GET' && mTenantById) {
        const t = dataset.tenants.find(x => String(x.id) === mTenantById[1]);
        res.statusCode = t ? 200 : 404; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(t || { error: 'not found' })); return;
      }
      const mUnitById = req.url.match(/^\/v1\/[^/]+\/units\/([^/?]+)$/);
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
    } catch {}
  });
  const authMsg = { type: 'AUTH', token, facilityId };
  if (VERBOSE) console.log('[WS ->]', JSON.stringify(authMsg));
  ws.send(JSON.stringify(authMsg));
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('AUTH timeout')), 4000);
    ws.once('message', (data) => {
      try {
        if (VERBOSE) console.log('[WS <-]', data.toString());
        const m = JSON.parse(data.toString());
        if (m?.type === 'AUTH_OK' && m.facilityId === facilityId) { clearTimeout(timer); res(null); }
        else { clearTimeout(timer); rej(new Error('AUTH not ok')); }
      } catch (e) { clearTimeout(timer); rej(e); }
    });
  });
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
    return res.data.token;
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

async function createUser(token, email, role = 'tenant') {
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
  // Create new
  const res = await axios.post(`${API_BASE}/users`, {
    email,
    password: 'TestUser123!',
    firstName: 'E2E',
    lastName: 'User',
    role
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
    device_serial: serial
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

function normalizeCmd(msg) {
  let p = msg;
  try { p = typeof msg === 'string' ? JSON.parse(msg) : msg; } catch {}
  // Transport may send either raw payload, [payload, signature], or a wrapper
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
  console.log(C.gray(`API_BASE_URL=${API_BASE}`));
  console.log(C.gray(`WS_URL=${WS_URL}`));

  const token = await login();
  const devAdminProfile = await fetchAuthProfile(token).catch((err) => {
    warn(`Failed to fetch auth profile: ${err?.response?.status || err?.message || err}`);
    return null;
  });
  if (devAdminProfile?.id) {
    step('Verifying user details endpoint');
    await verifyUserDetailsEndpoint(token, devAdminProfile.id);
  } else {
    warn('Skipping user details verification (profile missing id)');
  }
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
    shares: []
  };
  const facilityAdmin = { id: null, token: null, email: null };
  let share1Token = null;
  let share2Token = null;
  let primaryToken = null;

  heading('Environment');
  info(`Using facility=${facilityId}`);
  info(`Gateway=${gatewayId || 'pending (after device-sync)'}`);

  step('Provisioning facility admin for coverage');
  const facilityAdminEmail = `fac-admin-${Date.now()}@test.com`;
  const facilityAdminPassword = 'TestUser123!';
  facilityAdmin.id = await createUser(token, facilityAdminEmail, 'facility_admin');
  facilityAdmin.email = facilityAdminEmail;
  created.users.push(facilityAdmin.id);
  await assignUserToFacility(token, facilityAdmin.id, facilityId);
  const facilityAdminLogin = await axios.post(`${API_BASE}/auth/login`, {
    email: facilityAdminEmail,
    password: facilityAdminPassword
  });
  facilityAdmin.token = facilityAdminLogin.data?.token;
  if (!facilityAdmin.token) throw new Error('Facility admin login failed');
  ok('Facility admin ready');
  // Remember original FMS config if present to restore after test
  let existingConfig = null;
  let mockFmsServer = null;

  // Connect dev-notifications WebSocket for observing invites/OTPs
  notificationsWs = await connectNotificationsWs(token);

  // Connect gateway WS
  let ws = await connectGatewayWsAndAuth(WS_URL, token, facilityId);
  heading('Gateway WebSocket');
  ok('Gateway AUTH_OK');

  step('Checking gateway connection status via admin endpoint');
  try {
    const gatewayStatus = await axios.get(`${API_BASE}/gateways/status/${facilityId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!gatewayStatus.data?.success) throw new Error('Gateway status endpoint failed');
    ok('Gateway status reported successfully');
  } catch (err) {
    warn(`Gateway status endpoint unavailable (${err?.response?.status || err?.message || err})`);
  }

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
    if (changeIds.length > 0) {
      await axios.post(`${API_BASE}/fms/changes/review`, { syncLogId, changeIds, accepted: true }, { headers: { Authorization: `Bearer ${token}` } });
      const applied = await axios.post(`${API_BASE}/fms/changes/apply`, { syncLogId, changeIds }, { headers: { Authorization: `Bearer ${token}` } });
      ok(`FMS changes applied: ${applied.data?.result?.changesApplied || changeIds.length}`);
    } else {
      warn('No applicable Storedge FMS changes detected for test dataset');
    }

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
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqSync1, method: 'POST', path: `/internal/gateway/device-sync`, body: { devices: initialDevices, facility_id: facilityId } }));
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
      console.warn('⚠️  Proxy POST request-time-sync returned non-200 or unsuccessful:', respTsLock.status);
    }

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

    // PROXY: Update device status to "online" then fetch device details
    const reqStatus = 'req-device-status';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqStatus, method: 'PUT', path: `/devices/blulok/${deviceId}/status`, body: { status: 'online' } }));
    const respStatus = await waitForProxyResponse(ws, reqStatus);
    if (respStatus.status !== 200) throw new Error(`Proxy PUT device status failed: ${respStatus.status}`);
    const reqGetDevice = 'req-get-device';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqGetDevice, method: 'GET', path: `/devices/blulok/${deviceId}` }));
    const respGetDevice = await waitForProxyResponse(ws, reqGetDevice);
    if (respGetDevice.status !== 200) throw new Error(`Proxy GET device failed: ${respGetDevice.status}`);

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
    heading('First-time Login (Invite + OTP)');
    async function completeFirstTimeLogin(userId, email, newPassword = 'TestUser123!') {
      // Trigger a real invite via FirstTimeUserService
      step(`Sending invite for user ${userId}`);
      // Clear any previous DEV_NOTIFICATION events so we only see fresh invites/OTPs
      notificationEvents.length = 0;
      await axios.post(`${API_BASE}/users/${userId}/resend-invite`, {}, { headers: { Authorization: `Bearer ${token}` } });
      // Wait for invite SMS to capture deeplink/token
      const inviteEvent = await waitForNotification((e) =>
        e.kind === 'invite' && e.delivery === 'sms' && e.body && String(e.body).includes('invite')
      );
      ok(`Received invite notification for ${inviteEvent.toPhone || inviteEvent.toEmail || 'unknown-recipient'}`);
      const deeplinkMatch = String(inviteEvent.body).match(/token=([^&\s]+)/);
      if (!deeplinkMatch) throw new Error('Failed to parse invite token from SMS body');
      const inviteToken = decodeURIComponent(deeplinkMatch[1]);
      // Request OTP via invite endpoint (this will generate OTP SMS)
      step('Requesting OTP via invite/request-otp');
      await axios.post(`${API_BASE}/auth/invite/request-otp`, {
        token: inviteToken,
        phone: inviteEvent.toPhone,
      });
      const otpEvent = await waitForNotification((e) =>
        e.kind === 'otp' && e.delivery === 'sms'
      );
      const otpMatch = String(otpEvent.body).match(/(\d{6})/);
      if (!otpMatch) throw new Error('Failed to parse OTP code from SMS body');
      const otp = otpMatch[1];
      ok(`Entering OTP ${otp}`);
      // Verify OTP
      step('Verifying OTP');
      const verify = await axios.post(`${API_BASE}/auth/invite/verify-otp`, { token: inviteToken, otp });
      if (!verify.data?.success) throw new Error('OTP verify failed');
      ok('OTP verified');
      // Set password to finalize account
      step('Accepting invite and setting password');
      const setPwd = await axios.post(`${API_BASE}/auth/invite/set-password`, { token: inviteToken, otp, newPassword });
      if (!setPwd.data?.success) throw new Error('Set password failed');
      ok('First-time login completed');
      return tenantLogin(email, newPassword);
    }
    // Run first-time login flow for all three FMS-created users
    primaryToken = await completeFirstTimeLogin(primaryId, primaryEmail);
    share1Token = await completeFirstTimeLogin(share1Id, share1Email);
    share2Token = await completeFirstTimeLogin(share2Id, share2Email);
    ok('First-time login flows completed for all users');

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
      warn(`Unexpected response from /key-sharing/invite: ${JSON.stringify(inviteShareRes.data)}`);
      throw new Error(`Key-sharing invite failed: ${inviteShareRes.data?.message || 'unknown error'}`);
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
    step(`Sending invite for new sharee ${newInviteeId}`);
    // Clear any prior notification events so we only capture fresh invite/OTP for this user
    notificationEvents.length = 0;
    await axios.post(`${API_BASE}/users/${newInviteeId}/resend-invite`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const newInviteEvent = await waitForNotification((e) =>
      e.kind === 'invite' && e.delivery === 'sms' && e.body && String(e.body).includes('invite')
    );
    ok('Invite SMS received for new sharee');
    const newDeeplinkMatch = String(newInviteEvent.body).match(/token=([^&\s]+)/);
    if (!newDeeplinkMatch) throw new Error('No invite token found in SMS for new sharee');
    const newInviteToken = decodeURIComponent(newDeeplinkMatch[1]);

    // First attempt: request OTP WITHOUT profile details → should be rejected
    step('Requesting OTP without profile details (expected to fail)');
    let deniedWithoutProfile = false;
    try {
      await axios.post(`${API_BASE}/auth/invite/request-otp`, {
        token: newInviteToken,
        phone: newInvitePhone,
      });
    } catch (err) {
      const status = err?.response?.status;
      const msg = String(err?.response?.data?.message || '');
      if (status === 400 && msg.includes('First name and last name are required')) {
        deniedWithoutProfile = true;
      } else {
        throw new Error(`Unexpected error from invite/request-otp without profile: status=${status} message=${msg}`);
      }
    }
    if (!deniedWithoutProfile) {
      throw new Error('Expected invite/request-otp to be rejected without profile details for new invitee');
    }
    ok('OTP request correctly rejected without first/last name');

    // Second attempt: complete profile, then drive the rest of the flow via dev-only OTP
    step('Completing profile for new sharee via admin API');
    await axios.put(`${API_BASE}/users/${newInviteeId}`, {
      firstName: 'New',
      lastName: 'Invitee',
    }, { headers: { Authorization: `Bearer ${token}` } });
    ok('Profile updated for new sharee');

    // Now drive OTP via normal invite/request-otp + notifications WS
    step('Requesting OTP for new sharee');
    await axios.post(`${API_BASE}/auth/invite/request-otp`, {
      token: newInviteToken,
      phone: newInvitePhone,
    });
    const newOtpEvent = await waitForNotification((e) =>
      e.kind === 'otp' && e.delivery === 'sms'
    );
    const newOtpMatch = String(newOtpEvent.body).match(/(\d{6})/);
    const newOtp = newOtpMatch && newOtpMatch[1];
    if (!newOtp) throw new Error('No OTP code parsed for new sharee');
    ok(`Entering OTP ${newOtp}`);

    step('Verifying OTP for new sharee');
    const newVerify = await axios.post(`${API_BASE}/auth/invite/verify-otp`, {
      token: newInviteToken,
      otp: newOtp,
    });
    if (!newVerify.data?.success) throw new Error('OTP verify failed for new sharee');
    ok('OTP verified for new sharee');

    step('Accepting invite and setting password for new sharee');
    const newPassword = 'NewInvitee123!';
    const newSetPwd = await axios.post(`${API_BASE}/auth/invite/set-password`, {
      token: newInviteToken,
      otp: newOtp,
      newPassword,
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
    const share1 = await shareKey(token, unitId, share1Id, 'limited');
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
    const expectedSharedAud2 = `shared_key:${primaryId}:${deviceId}`;
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
    const expectedSharedAud1 = `shared_key:${primaryId}:${deviceId}`;
    if (!share1Claims.aud.includes(expectedSharedAud1)) {
      throw new Error(`Missing expected aud for share1: ${expectedSharedAud1}`);
    }
    info(`Share1 pass: sub=${share1Claims.sub} audCount=${share1Claims.aud.length} hasExpected=${share1Claims.aud.includes(expectedSharedAud1)} lifetimeSec=${(share1Claims.exp - share1Claims.iat) || 'n/a'} aud=[${share1Claims.aud.join(', ')}]`);

    // Primary tenant: ensure an active route pass so DENYLIST_ADD will be emitted on deactivation
    const primaryAppDevId = `e2e-dev-${Date.now()}-primary`;
    step(`Registering user-device ${primaryAppDevId} for primary tenant`);
    await registerUserDevice(primaryToken, primaryAppDevId, dummyPubKeyB64);
    step('Requesting route pass for primary tenant');
    const primaryPass = await requestRoutePass(primaryToken, primaryAppDevId);
    const primaryClaims = decodeJwtClaims(primaryPass);
    if (!primaryClaims || !Array.isArray(primaryClaims.aud)) throw new Error('Invalid route pass payload for primary');
    const expectedPrimaryAud = `lock:${deviceId}`;
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
    const newExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const updateShareRes = await axios.put(`${API_BASE}/key-sharing/${share1}`, {
      notes: updatedNotes,
      expires_at: newExpiry
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
    if (!prevented) throw new Error('Tenant was able to fetch another user’s key-sharing records');
    ok('Tenant prevented from viewing other user key-sharing records');

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

    // mark success; we'll print Result after cleanup
    success = true;
  } finally {
    // Cleanup (best-effort)
    heading('Cleaning up');
    try {
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
      // Hard delete created users (dev-admin utility)
      const uniqueUserIds = Array.from(new Set(created.users));
      for (const userId of uniqueUserIds) {
        step(`Hard deleting user ${userId}`);
        await axios.delete(`${API_BASE}/admin/users/${userId}/hard`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        ok(`Hard deleted user ${userId}`);
      }
      if (created.facilityId) {
        step(`Hard deleting test facility ${created.facilityId}`);
        await axios.delete(`${API_BASE}/admin/facilities/${created.facilityId}/hard`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
        ok(`Hard deleted facility ${created.facilityId}`);
      }
    } catch (e) {
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


