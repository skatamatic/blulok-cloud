/* eslint-disable no-console */
/**
 * Device metadata editing E2E
 *
 * Exercises PUT /devices/blulok/:id/metadata and /devices/access-control/:id/metadata
 * against a running backend.
 *
 * When E2E_BLULOK_DEVICE_ID is unset, provisions a disposable facility + devices and cleans up.
 *
 * Env:
 *   API_BASE_URL (default http://127.0.0.1:3000/api/v1)
 *   DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD
 *   E2E_BLULOK_DEVICE_ID — BluLok device UUID (optional; auto-provision if unset)
 *   E2E_AC_DEVICE_ID — access control device UUID (optional)
 *
 * Usage:
 *   node scripts/device-metadata-e2e.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios').default;
const dotenv = require('dotenv');

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

const e2ePort =
  parsePortNum(process.env.E2E_API_PORT || process.env.BACKEND_PORT) ??
  readPortFromBackendEnvFile() ??
  parsePortNum(process.env.PORT) ??
  3000;

const API_BASE = process.env.API_BASE_URL || `http://127.0.0.1:${e2ePort}/api/v1`;
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';
const ENV_BLULOK_ID = process.env.E2E_BLULOK_DEVICE_ID?.trim();
const ENV_AC_ID = process.env.E2E_AC_DEVICE_ID?.trim();

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
  passed += 1;
}
function bad(msg) {
  console.log(`  ✗ ${msg}`);
  failed += 1;
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else bad(msg);
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login() {
  const res = await axios.post(`${API_BASE}/auth/login`, { email: EMAIL, password: PASSWORD });
  return res.data?.token;
}

async function provisionTestDevices(token) {
  const headers = authHeaders(token);
  const stamp = Date.now();
  const facilityRes = await axios.post(
    `${API_BASE}/admin/facilities`,
    {
      name: `E2E-Metadata-${stamp}`,
      address: '1 Metadata Test Ln',
      status: 'active',
      metadata: { e2e: 'device-metadata' },
    },
    { headers },
  );
  const facilityId = facilityRes.data?.facility?.id || facilityRes.data?.id;
  if (!facilityId) throw new Error('Failed to create E2E facility');

  await axios.post(
    `${API_BASE}/gateways`,
    {
      facility_id: facilityId,
      name: 'E2E Metadata Gateway',
      gateway_type: 'http',
      base_url: 'http://127.0.0.1',
      status: 'online',
    },
    { headers },
  );
  const gatewayListRes = await axios.get(`${API_BASE}/gateways`, {
    headers,
    params: { facility_id: facilityId },
  });
  const gatewayId = gatewayListRes.data?.gateways?.[0]?.id;
  if (!gatewayId) throw new Error('Failed to create E2E gateway');

  const blSerial = `E2E-META-BL-${stamp}`;
  const blRes = await axios.post(
    `${API_BASE}/devices/blulok`,
    {
      gateway_id: gatewayId,
      device_serial: blSerial,
      name: 'E2E Metadata BluLok',
      device_type: 'blulok',
    },
    { headers },
  );
  const blulokId = blRes.data?.device?.id;
  if (!blulokId) throw new Error('Failed to create E2E BluLok device');

  const acSerial = `E2E-META-AC-${stamp}`;
  const acRes = await axios.post(
    `${API_BASE}/devices/access-control`,
    {
      gateway_id: gatewayId,
      device_serial: acSerial,
      name: 'E2E Metadata Door',
      device_type: 'door',
      relay_channel: 1,
      location_description: 'E2E metadata door',
    },
    { headers },
  );
  const acId = acRes.data?.device?.id;
  if (!acId) throw new Error('Failed to create E2E access control device');

  return { facilityId, blulokId, acId };
}

async function hardDeleteFacility(token, facilityId) {
  if (!facilityId) return;
  try {
    await axios.delete(`${API_BASE}/admin/facilities/${facilityId}/hard`, {
      headers: authHeaders(token),
    });
    ok(`Cleaned up E2E facility ${facilityId}`);
  } catch (err) {
    bad(`Facility cleanup failed: ${err?.response?.data?.message || err.message}`);
  }
}

async function runBlulokMetadataTests(token, blulokId, headers) {
  const getRes = await axios.get(`${API_BASE}/devices/blulok/${blulokId}`, { headers });
  const originalSerial = getRes.data?.device?.device_serial;
  assert(!!originalSerial, 'Load BluLok device');

  if (!originalSerial) return;

  const tempSerial = `${originalSerial}-e2e-${Date.now()}`;
  const putRes = await axios.put(
    `${API_BASE}/devices/blulok/${blulokId}/metadata`,
    { device_serial: tempSerial },
    { headers },
  );
  assert(putRes.status === 200, 'PUT BluLok metadata returns 200');
  assert(putRes.data?.sideEffects?.identityChanged === true, 'BluLok identityChanged flagged');
  assert(
    putRes.data?.device?.device_serial === tempSerial,
    'BluLok device_serial updated in response',
  );

  const revertRes = await axios.put(
    `${API_BASE}/devices/blulok/${blulokId}/metadata`,
    { device_serial: originalSerial },
    { headers },
  );
  assert(revertRes.status === 200, 'Revert BluLok serial');
}

async function runAccessControlMetadataTests(token, acId, headers) {
  const getAc = await axios.get(`${API_BASE}/devices/access-control/${acId}`, { headers });
  const ac = getAc.data?.device;
  assert(!!ac?.device_serial, 'Load access control device');
  if (!ac?.device_serial) return;

  const putAc = await axios.put(
    `${API_BASE}/devices/access-control/${acId}/metadata`,
    {
      name: ac.name,
      location_description: ac.location_description || 'E2E location',
      device_serial: ac.device_serial,
      relay_channel: ac.relay_channel,
      access_methods: ac.access_methods || ['app'],
    },
    { headers },
  );
  assert(putAc.status === 200, 'PUT access-control metadata (no-op) returns 200');
  assert(putAc.data?.device?.id === acId, 'Access control device id stable');
}

async function main() {
  console.log('\n▸ Device metadata E2E');
  console.log(`  API: ${API_BASE}`);

  const token = await login();
  assert(!!token, 'DEV_ADMIN login');
  if (!token) process.exit(1);

  const headers = authHeaders(token);
  let blulokId = ENV_BLULOK_ID;
  let acId = ENV_AC_ID;
  let provisionedFacilityId = null;

  if (!blulokId) {
    console.log('\n  ℹ Provisioning disposable facility + devices for metadata checks');
    try {
      const provisioned = await provisionTestDevices(token);
      provisionedFacilityId = provisioned.facilityId;
      blulokId = provisioned.blulokId;
      if (!acId) acId = provisioned.acId;
      ok(`Provisioned BluLok ${blulokId} and AC ${acId}`);
    } catch (err) {
      bad(`Provisioning failed: ${err?.response?.data?.message || err.message}`);
    }
  }

  if (blulokId) {
    try {
      await runBlulokMetadataTests(token, blulokId, headers);
    } catch (err) {
      bad(`BluLok metadata tests failed: ${err?.response?.data?.message || err.message}`);
    }
  } else {
    bad('No BluLok device available for metadata checks');
  }

  if (acId) {
    try {
      await runAccessControlMetadataTests(token, acId, headers);
    } catch (err) {
      bad(`Access-control metadata tests failed: ${err?.response?.data?.message || err.message}`);
    }
  } else {
    console.log('\n  ℹ No access-control device — skipping AC metadata checks');
  }

  if (provisionedFacilityId) {
    await hardDeleteFacility(token, provisionedFacilityId);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.response?.data || err);
  process.exit(1);
});
