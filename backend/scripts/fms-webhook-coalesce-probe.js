/* eslint-disable no-console */
const crypto = require('crypto');
const http = require('http');
const axios = require('axios').default;
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000/api/v1';
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASS = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';

function startMock(dataset) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = (req.url || '').split('?')[0];
      if (req.method === 'GET' && /\/units$/.test(pathname)) {
        res.end(JSON.stringify({ units: dataset.units }));
        return;
      }
      if (req.method === 'GET' && /\/tenants\/current$/.test(pathname)) {
        res.end(JSON.stringify({ tenants: dataset.tenants }));
        return;
      }
      if (req.method === 'GET' && /\/ledgers\/current$/.test(pathname)) {
        res.end(JSON.stringify({ ledgers: dataset.ledgers }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function postWh(facilityId, envelope, secret) {
  const body = JSON.stringify(envelope);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return axios.post(`${API}/fms/webhook/${facilityId}`, body, {
    headers: { 'Content-Type': 'application/json', 'X-Storable-Signature': sig },
    transformRequest: [(d) => d],
    validateStatus: () => true,
  });
}

async function main() {
  const login = await axios.post(`${API}/auth/login`, { email: EMAIL, password: PASS });
  const token = login.data.token;
  const h = { Authorization: `Bearer ${token}` };

  const ts = Date.now();
  const secret = `probe-${ts}`;
  const extFac = `ext-probe-${ts}`;
  const extUnit = `ext-u-${ts}`;
  const extTenant = `ext-t-${ts}`;
  const unitNum = `WH-PROBE-${ts}`;

  const dataset = {
    tenants: [{ id: extTenant, email: `p${ts}@t.com`, first_name: 'P', last_name: 'T', active: true }],
    units: [{ id: extUnit, name: unitNum, unit_type: { name: 'S' }, status: 'occupied', current_tenant_id: extTenant }],
    ledgers: [{ tenant: { id: extTenant }, unit: { id: extUnit } }],
  };

  const mock = await startMock(dataset);
  const port = mock.address().port;

  const fac = await axios.post(`${API}/admin/facilities`, {
    name: `WH-Probe-${ts}`,
    address: '1 Test',
    status: 'active',
    metadata: { e2e: true },
  }, { headers: h });
  const fid = fac.data.facility.id;

  const cfg = await axios.post(`${API}/fms/config`, {
    facility_id: fid,
    provider_type: 'storedge',
    is_enabled: true,
    config: {
      providerType: 'storedge',
      baseUrl: `http://127.0.0.1:${port}`,
      auth: { type: 'api_key', credentials: { apiKey: 'k' } },
      features: { supportsTenantSync: true, supportsUnitSync: true, supportsWebhooks: true, supportsRealtime: false },
      syncSettings: { autoAcceptChanges: false, webhookSecret: secret },
      customSettings: { facilityId: extFac },
    },
  }, { headers: h });

  const sync = await axios.post(`${API}/fms/sync/${fid}`, {}, { headers: h });
  const sid = sync.data.result.syncLogId;
  const pending = await axios.get(`${API}/fms/changes/${sid}/pending`, { headers: h });
  const ids = (pending.data.changes || []).map((c) => c.id);
  await axios.post(`${API}/fms/changes/review`, { syncLogId: sid, changeIds: ids, accepted: true }, { headers: h });
  await axios.post(`${API}/fms/changes/apply`, { syncLogId: sid, changeIds: ids }, { headers: h });

  const mk = (id, type, body) => ({
    id,
    type,
    body: { facility_id: extFac, ...body },
  });

  const r1 = await postWh(fid, mk(`e1-${ts}`, 'com.storedge.tenant.updated.v1', {
    tenant_id: extTenant,
    first_name: 'P',
    last_name: 'U1',
    email: `p${ts}@t.com`,
  }), secret);
  const r2 = await postWh(fid, mk(`e2-${ts}`, 'com.storedge.unit.overlock-applied.v1', { unit_id: extUnit }), secret);
  const r3 = await postWh(fid, mk(`e3-${ts}`, 'com.storedge.tenant.updated.v1', {
    tenant_id: extTenant,
    first_name: 'P',
    last_name: 'U2',
    email: `p${ts}@t.com`,
  }), secret);

  console.log('r1', r1.status, JSON.stringify(r1.data));
  console.log('r2', r2.status, JSON.stringify(r2.data));
  console.log('r3', r3.status, JSON.stringify(r3.data));
  console.log('coalesced', r1.data.syncLogId === r2.data.syncLogId && r2.data.syncLogId === r3.data.syncLogId);

  mock.close();
  await axios.delete(`${API}/fms/config/${cfg.data.config.id}`, { headers: h }).catch(() => {});
  await axios.delete(`${API}/admin/facilities/${fid}/hard`, { headers: h }).catch(() => {});
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
