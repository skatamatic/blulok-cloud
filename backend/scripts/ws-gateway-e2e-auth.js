/**
 * Switchable gateway WS auth helpers for ws-gateway-e2e.js
 * E2E_GATEWAY_AUTH=legacy (default) | ztp
 */
const crypto = require('crypto');
const WebSocket = require('ws');

const E2E_GATEWAY_AUTH = (process.env.E2E_GATEWAY_AUTH || 'legacy').trim().toLowerCase();

function buildZtpSignPayload(prefix, nonce, deviceId) {
  return Buffer.concat([
    Buffer.from(prefix, 'utf8'),
    Buffer.from([0]),
    Buffer.from(nonce, 'utf8'),
    Buffer.from([0]),
    Buffer.from(deviceId, 'utf8'),
  ]);
}

function signZtpPayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  return crypto
    .sign('sha256', payload, key)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function spkiPemToCompressedB64url(pem) {
  const key = crypto.createPublicKey(pem);
  const der = key.export({ type: 'spki', format: 'der' });
  const uncompressed = der.subarray(der.length - 65);
  const x = uncompressed.subarray(1, 33);
  const y = uncompressed.subarray(33, 65);
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x])
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateP256KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    publicKeyCompressedB64url: spkiPemToCompressedB64url(publicKeyPem),
    privateKeyPem,
  };
}

function deriveProvisionWsUrl(wsUrl) {
  if (process.env.PROVISION_WS_URL?.trim()) return process.env.PROVISION_WS_URL.trim();
  return String(wsUrl).replace(/\/ws\/gateway\/?$/, '/ws/gateway-provision');
}

/** Module-level ZTP fixture used when E2E_GATEWAY_AUTH=ztp */
let ztpFixture = null;

function getZtpFixture() {
  return ztpFixture;
}

function setZtpFixture(fixture) {
  ztpFixture = fixture;
}

function ensureZtpFixture() {
  if (!ztpFixture) {
    const keys = generateP256KeyPair();
    ztpFixture = {
      deviceId: crypto.randomUUID(),
      ...keys,
    };
  }
  return ztpFixture;
}

async function provisionAndClaimGateway({
  provisionWsUrl,
  apiBase,
  claimToken,
  facilityId,
  name,
  fixture,
  /** When false, do not replace the global primary ZTP fixture (secondary/swap claims). */
  persistFixture = true,
}) {
  const f = fixture || ensureZtpFixture();
  const ws = new WebSocket(provisionWsUrl);
  await new Promise((res, rej) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      rej(
        new Error(
          `provision WS open timeout (${provisionWsUrl}) — is GatewayProvisionWebSocketService initialized? Restart backend if you just added ZTP.`,
        ),
      );
    }, 10000);
    ws.once('open', () => {
      clearTimeout(timer);
      res();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      rej(err);
    });
  });

  const waitMsg = (pred, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('provision wait timeout')), timeoutMs);
      const onMsg = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (pred(msg)) {
            clearTimeout(timer);
            ws.off('message', onMsg);
            resolve(msg);
          }
        } catch {
          /* ignore */
        }
      };
      ws.on('message', onMsg);
    });

  ws.send(
    JSON.stringify({
      type: 'PROVISION_HELLO',
      device_id: f.deviceId,
      public_key: f.publicKeyCompressedB64url,
    }),
  );
  const challenge = await waitMsg((m) => m?.type === 'PROVISION_CHALLENGE');
  const payload = buildZtpSignPayload('blulok-ztp-v1', challenge.nonce, f.deviceId);
  const signature = signZtpPayload(f.privateKeyPem, payload);
  ws.send(JSON.stringify({ type: 'PROVISION_AUTH', signature }));
  await waitMsg((m) => m?.type === 'PROVISION_WAITING');

  const assignedPromise = waitMsg((m) => m?.type === 'PROVISION_ASSIGNED', 30000);

  const axios = require('axios');
  const claimRes = await axios.post(
    `${apiBase}/gateways/claim`,
    {
      facility_id: facilityId,
      device_id: f.deviceId,
      public_key: f.publicKeyCompressedB64url,
      name: name || 'E2E ZTP Gateway',
    },
    { headers: { Authorization: `Bearer ${claimToken}` }, validateStatus: () => true },
  );
  if (claimRes.status !== 201 && claimRes.status !== 200) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    throw new Error(`ZTP claim failed: ${claimRes.status} ${JSON.stringify(claimRes.data)}`);
  }

  const assigned = await assignedPromise;
  try {
    ws.send(JSON.stringify({ type: 'PROVISION_ACK' }));
    ws.close();
  } catch {
    /* ignore */
  }

  if (persistFixture !== false) {
    setZtpFixture(f);
  }
  const bound = claimRes.data?.bound;
  const sessionRole =
    claimRes.data?.sessionRole ||
    assigned?.sessionRole ||
    (bound === false ? 'swap_candidate' : bound === true ? 'active' : undefined);
  return {
    gatewayId: f.deviceId,
    fixture: f,
    bound,
    sessionRole,
    created: claimRes.data?.created,
    claim: claimRes.data,
    assigned,
  };
}

async function connectGatewayWsZtp(wsUrl, { privateKeyPem, gatewayId, facilityId, firmware_version, onMessageSetup }) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      rej(new Error(`ZTP gateway WS open timeout (${wsUrl})`));
    }, 10000);
    ws.once('open', () => {
      clearTimeout(timer);
      res();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      rej(err);
    });
  });
  if (typeof onMessageSetup === 'function') onMessageSetup(ws);

  const waitMsg = (pred, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ZTP AUTH wait timeout')), timeoutMs);
      const onMsg = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (pred(msg)) {
            clearTimeout(timer);
            ws.off('message', onMsg);
            resolve(msg);
          }
        } catch {
          /* ignore */
        }
      };
      ws.on('message', onMsg);
    });

  const hello = { type: 'AUTH_HELLO', gatewayId, facilityId };
  if (firmware_version) hello.firmware_version = firmware_version;
  ws.send(JSON.stringify(hello));
  const challenge = await waitMsg((m) => m?.type === 'AUTH_CHALLENGE');
  const payload = buildZtpSignPayload('blulok-gw-auth-v1', challenge.nonce, gatewayId);
  const signature = signZtpPayload(privateKeyPem, payload);
  ws.send(JSON.stringify({ type: 'AUTH_PROOF', signature }));
  const authOk = await waitMsg(
    (m) => m?.type === 'AUTH_OK' && m.facilityId === facilityId,
  );
  return { ws, authOk };
}

module.exports = {
  E2E_GATEWAY_AUTH,
  generateP256KeyPair,
  deriveProvisionWsUrl,
  ensureZtpFixture,
  getZtpFixture,
  setZtpFixture,
  provisionAndClaimGateway,
  connectGatewayWsZtp,
  buildZtpSignPayload,
  signZtpPayload,
};
