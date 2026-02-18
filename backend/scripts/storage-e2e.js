/* eslint-disable no-console */
/**
 * Storage E2E Test Script
 *
 * Exercises both firmware and BluDesign storage through the running backend,
 * testing against Google Cloud Storage using Application Default Credentials.
 *
 * Prerequisites:
 *   - `gcloud auth application-default login` (for local dev)
 *   - Backend running at API_BASE_URL
 *
 * Optional env vars:
 *   API_BASE_URL           (default http://127.0.0.1:3000/api/v1)
 *   DEV_ADMIN_EMAIL        (default devadmin@blulok.com)
 *   DEV_ADMIN_PASSWORD     (default DevAdmin123!@#)
 *   GCS_PROJECT_ID         (default BluLok-Cloud-Dev)
 *   GCS_BUCKET_NAME        (default blulok-develop)
 *
 * Usage:
 *   node scripts/storage-e2e.js [--verbose]
 */

const axios = require('axios').default;
const crypto = require('crypto');
const FormData = require('form-data');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const EMAIL = process.env.DEV_ADMIN_EMAIL || 'devadmin@blulok.com';
const PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin123!@#';
const VERBOSE = process.env.E2E_VERBOSE === '1' || process.argv.includes('--verbose');

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev';
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'blulok-develop';

axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS) || 30000;

// ── Colour helpers ──────────────────────────────────────────────────────────

const C = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function ok(msg) { console.log(`  ${C.green('✓')} ${msg}`); }
function fail(msg) { console.log(`  ${C.red('✗')} ${msg}`); }
function info(msg) { console.log(`  ${C.cyan('ℹ')} ${msg}`); }
function verbose(msg) { if (VERBOSE) console.log(`    ${C.gray(msg)}`); }
function section(title) { console.log(`\n${C.bold(C.cyan('▸ ' + title))}`); }

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    ok(msg);
    passed++;
  } else {
    fail(msg);
    failed++;
  }
}

// ============================================================================
// Authentication
// ============================================================================

async function login() {
  section('Authentication');
  const res = await axios.post(`${API_BASE}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token = res.data?.token;
  assert(!!token, 'Login as DEV_ADMIN');
  verbose(`Token: ${token?.substring(0, 20)}...`);
  return token;
}

// ============================================================================
// Part 1: Firmware Storage via Admin Config + GCS
// ============================================================================

function gcsConfig() {
  return {
    providerType: 'gcs',
    providerConfig: {
      projectId: GCS_PROJECT_ID,
      bucketName: GCS_BUCKET_NAME,
    },
  };
}

let originalStorageConfig = null;

async function captureOriginalConfig(token) {
  const getRes = await axios.get(`${API_BASE}/admin/storage-config`, { headers: authHeaders(token) });
  if (getRes.data.success && getRes.data.config) {
    originalStorageConfig = {
      providerType: getRes.data.config.providerType,
      providerConfig: getRes.data.config.providerConfig,
    };
  }
  return getRes;
}

async function testFirmwareStorageConfig(token) {
  section('Firmware Storage Config (Admin Routes)');

  // 1. Read and capture current config (for restoration later)
  const getRes = await captureOriginalConfig(token);
  assert(getRes.status === 200 && getRes.data.success, 'GET storage config');
  verbose(`Original config: ${JSON.stringify(getRes.data.config)}`);

  // 2. Test the GCS config without saving (write/read/delete cycle)
  const testRes = await axios.post(`${API_BASE}/admin/storage-config/test`, gcsConfig(), { headers: authHeaders(token) });
  assert(testRes.status === 200 && testRes.data.success, 'POST test GCS config');
  if (testRes.data.steps) {
    for (const step of testRes.data.steps) {
      verbose(`  ${step.step}: ${step.status} (${step.durationMs}ms)${step.detail ? ' - ' + step.detail : ''}`);
    }
  }

  // 3. Save the config
  const putRes = await axios.put(`${API_BASE}/admin/storage-config`, gcsConfig(), { headers: authHeaders(token) });
  assert(putRes.status === 200 && putRes.data.success, 'PUT save GCS config');

  // 4. Verify it reads back (with correct type and source)
  const verifyRes = await axios.get(`${API_BASE}/admin/storage-config`, { headers: authHeaders(token) });
  assert(
    verifyRes.data.config?.providerType === 'gcs' && verifyRes.data.config?.source === 'database',
    'Config persisted in DB as GCS',
  );
  verbose(`Verified config: ${JSON.stringify(verifyRes.data.config)}`);
}

async function testFirmwareUploadDownloadDelete(token) {
  section('Firmware Upload / Download / Delete (via GCS backend)');

  // Create a fake firmware binary
  const fwData = crypto.randomBytes(256);
  const fwSha256 = crypto.createHash('sha256').update(fwData).digest('hex');

  // Upload firmware via multipart/form-data
  const form = new FormData();
  form.append('file', fwData, { filename: `e2e-test-${Date.now()}.bin`, contentType: 'application/octet-stream' });
  form.append('version', `99.0.${Date.now()}`);
  form.append('target_type', 'gateway');
  form.append('description', 'E2E storage test');

  let firmwareId;
  try {
    const uploadRes = await axios.post(`${API_BASE}/firmware/upload`, form, {
      headers: {
        ...authHeaders(token),
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
    });

    assert(uploadRes.status === 200 || uploadRes.status === 201, `Upload firmware (status ${uploadRes.status})`);
    firmwareId = uploadRes.data?.firmware?.id || uploadRes.data?.data?.id || uploadRes.data?.id;
    assert(!!firmwareId, `Got firmware ID: ${firmwareId}`);
    verbose(`Firmware ID: ${firmwareId}, SHA256: ${fwSha256}`);
  } catch (err) {
    fail(`Upload firmware: ${err.response?.status || err.message}`);
    failed++;
    verbose(JSON.stringify(err.response?.data));
    return null;
  }

  // Verify firmware appears in the list
  try {
    const listRes = await axios.get(`${API_BASE}/firmware`, { headers: authHeaders(token) });
    const found = (listRes.data?.data || []).some((f) => f.id === firmwareId);
    assert(found, 'Firmware appears in list');
  } catch (err) {
    fail(`List firmware: ${err.response?.status || err.message}`);
    failed++;
  }

  // Delete firmware
  try {
    const delRes = await axios.delete(`${API_BASE}/firmware/${firmwareId}`, { headers: authHeaders(token) });
    assert(delRes.status === 200 || delRes.status === 204, 'Delete firmware');
  } catch (err) {
    fail(`Delete firmware: ${err.response?.status || err.message}`);
    failed++;
  }

  return firmwareId;
}

async function restoreOriginalStorageConfig(token) {
  section('Restore original storage config');
  if (!originalStorageConfig) {
    info('No original config captured, skipping restore');
    return;
  }
  verbose(`Restoring: ${JSON.stringify(originalStorageConfig)}`);
  const putRes = await axios.put(`${API_BASE}/admin/storage-config`, originalStorageConfig, { headers: authHeaders(token) });
  assert(putRes.status === 200, `Restored storage config to ${originalStorageConfig.providerType}`);
}

// ============================================================================
// Part 2: BluDesign Storage with GCS
// ============================================================================

async function testBluDesignStorageGCS(token) {
  section('BluDesign Storage (GCS)');

  // 1. Create a project with GCS storage
  let projectId;
  try {
    const projectRes = await axios.post(`${API_BASE}/bludesign/projects`, {
      name: `E2E-GCS-Test-${Date.now()}`,
      description: 'E2E storage test project (GCS)',
      storageProvider: 'gcs',
      storageConfig: {
        projectId: GCS_PROJECT_ID,
        bucketName: GCS_BUCKET_NAME,
      },
    }, { headers: authHeaders(token) });

    assert(projectRes.status === 200 || projectRes.status === 201, `Create BluDesign project (status ${projectRes.status})`);
    projectId = projectRes.data?.project?.id || projectRes.data?.data?.id || projectRes.data?.id;
    assert(!!projectId, `Got project ID: ${projectId}`);
    verbose(`Project ID: ${projectId}`);
  } catch (err) {
    fail(`Create BluDesign project: ${err.response?.status || err.message}`);
    failed++;
    verbose(JSON.stringify(err.response?.data));
    return;
  }

  // 2. Create an asset record
  let assetId;
  try {
    const assetRes = await axios.post(`${API_BASE}/bludesign/projects/${projectId}/assets`, {
      name: 'E2E Test Asset',
      category: 'storage_unit',
      geometry: { type: 'glb' },
      metadata: {
        description: 'E2E test asset',
        dimensions: { width: 1, height: 1, depth: 1 },
        gridUnits: { x: 1, z: 1 },
        canRotate: true,
        canStack: false,
      },
    }, { headers: authHeaders(token) });

    assetId = assetRes.data?.asset?.id || assetRes.data?.data?.id || assetRes.data?.id;
    assert(!!assetId, `Create asset → id=${assetId}`);
    verbose(`Asset ID: ${assetId}`);
  } catch (err) {
    fail(`Create asset: ${err.response?.status || err.message}`);
    failed++;
    verbose(JSON.stringify(err.response?.data));
  }

  if (assetId) {
    // 3. Upload a file to the asset
    const fileData = crypto.randomBytes(64);
    const fileSha = crypto.createHash('sha256').update(fileData).digest('hex');

    try {
      const uploadForm = new FormData();
      uploadForm.append('file', fileData, { filename: 'test-asset.glb', contentType: 'application/octet-stream' });

      const uploadRes = await axios.post(
        `${API_BASE}/bludesign/projects/${projectId}/assets/${assetId}/upload`,
        uploadForm,
        { headers: { ...authHeaders(token), ...uploadForm.getHeaders() } },
      );
      assert(uploadRes.status === 200 || uploadRes.status === 201, 'Upload asset file');
    } catch (err) {
      fail(`Upload asset file: ${err.response?.status || err.message}`);
      failed++;
      verbose(JSON.stringify(err.response?.data));
    }

    // 4. Download and verify
    try {
      const dlRes = await axios.get(
        `${API_BASE}/bludesign/projects/${projectId}/assets/${assetId}/download/test-asset.glb`,
        { headers: authHeaders(token), responseType: 'arraybuffer' },
      );
      assert(dlRes.status === 200, 'Download asset file');
      const dlSha = crypto.createHash('sha256').update(Buffer.from(dlRes.data)).digest('hex');
      assert(dlSha === fileSha, 'Downloaded file SHA256 matches');
      verbose(`Upload SHA: ${fileSha}, Download SHA: ${dlSha}`);
    } catch (err) {
      fail(`Download asset file: ${err.response?.status || err.message}`);
      failed++;
    }

    // 5. List assets
    try {
      const listRes = await axios.get(`${API_BASE}/bludesign/projects/${projectId}/assets`, {
        headers: authHeaders(token),
      });
      assert(listRes.status === 200, 'List assets');
      const assets = listRes.data?.assets || listRes.data?.data || [];
      assert(Array.isArray(assets), 'Assets response is an array');
    } catch (err) {
      fail(`List assets: ${err.response?.status || err.message}`);
      failed++;
    }

    // 6. Delete asset
    try {
      const deleteRes = await axios.delete(
        `${API_BASE}/bludesign/projects/${projectId}/assets/${assetId}`,
        { headers: authHeaders(token) },
      );
      assert(deleteRes.status === 200 || deleteRes.status === 204, 'Delete asset');
    } catch (err) {
      fail(`Delete asset: ${err.response?.status || err.message}`);
      failed++;
    }
  }

  // 7. Delete project (cleanup)
  try {
    const delRes = await axios.delete(`${API_BASE}/bludesign/projects/${projectId}`, {
      headers: authHeaders(token),
    });
    assert(delRes.status === 200 || delRes.status === 204, 'Delete project (cleanup)');
  } catch (err) {
    fail(`Delete project: ${err.response?.status || err.message}`);
    failed++;
  }
}

// ============================================================================
// Part 3: Error handling
// ============================================================================

async function testErrorCases(token) {
  section('Error Handling');

  // Invalid provider type
  try {
    await axios.put(`${API_BASE}/admin/storage-config`, {
      providerType: 'invalid',
      providerConfig: {},
    }, { headers: authHeaders(token) });
    fail('Should have rejected invalid provider type');
    failed++;
  } catch (err) {
    assert(err.response?.status === 400, 'Reject invalid provider type with 400');
  }

  // Missing config fields for GCS
  try {
    await axios.post(`${API_BASE}/admin/storage-config/test`, {
      providerType: 'gcs',
      providerConfig: { bucketName: 'only-one-field' },
    }, { headers: authHeaders(token) });
    fail('Should have rejected incomplete GCS config');
    failed++;
  } catch (err) {
    assert(err.response?.status === 400, 'Reject incomplete GCS config with 400');
  }

  // Missing body
  try {
    await axios.post(`${API_BASE}/admin/storage-config/test`, {}, { headers: authHeaders(token) });
    fail('Should have rejected empty body');
    failed++;
  } catch (err) {
    assert(err.response?.status === 400, 'Reject empty test body with 400');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(C.bold('\n🔧 Storage E2E Test Suite (GCS)\n'));
  info(`GCS Project: ${GCS_PROJECT_ID}`);
  info(`GCS Bucket:  ${GCS_BUCKET_NAME}`);
  info(`API Base:    ${API_BASE}`);

  let token;
  try {
    token = await login();
    if (!token) {
      console.log(C.red('\nFailed to authenticate. Aborting.\n'));
      process.exit(1);
    }

    // Part 1: Firmware storage config + upload/download/delete via GCS
    await testFirmwareStorageConfig(token);
    await testFirmwareUploadDownloadDelete(token);
    await restoreOriginalStorageConfig(token);

    // Part 2: BluDesign project storage via GCS
    await testBluDesignStorageGCS(token);

    // Part 3: Error handling
    await testErrorCases(token);
  } catch (err) {
    console.log(C.red(`\n✗ Unhandled error: ${err.message}`));
    if (err.response) {
      console.log(C.red(`  Status: ${err.response.status}`));
      verbose(JSON.stringify(err.response.data));
    }
    if (VERBOSE) console.error(err);
    failed++;

    // Best-effort restore even on failure
    if (token && originalStorageConfig) {
      try {
        await axios.put(`${API_BASE}/admin/storage-config`, originalStorageConfig, { headers: authHeaders(token) });
        info('Restored original storage config after failure');
      } catch { /* best effort */ }
    }
  }

  // Summary
  console.log(`\n${C.bold('─'.repeat(50))}`);
  console.log(`  ${C.green(`${passed} passed`)}  ${failed > 0 ? C.red(`${failed} failed`) : C.dim('0 failed')}`);
  console.log(C.bold('─'.repeat(50)) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
