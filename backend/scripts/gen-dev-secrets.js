/*
 * Generate development secrets: Ops keys, Root keys, and JWT secret
 *
 * CRITICAL WARNING (ROOT PRIVATE KEY):
 *   The ROOT private key grants highest trust. Store it OFFLINE in an ultra secure location.
 *   Do NOT commit. Do NOT share. Prefer an HSM or offline vault.
 *
 * Usage:
 *   node scripts/gen-dev-secrets.js
 *
 * Output:
 *   - .env-ready lines for OPS (private/public), ROOT (public), and JWT secret
 *   - ROOT private key printed once with a strong warning
 */

const { generateKeyPair, exportJWK, importJWK, exportSPKI } = require('jose');
const crypto = require('crypto');

function isBase64Url(str) {
  return /^[A-Za-z0-9_-]+$/.test(str);
}

function decodeBase64Url(str) {
  return Buffer.from(str, 'base64url');
}

async function generateEd25519Pair() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);
  const d = jwkPriv && jwkPriv.d;
  const x = jwkPub && jwkPub.x;
  if (!d || !x) throw new Error('Failed to export JWK components (d/x)');
  if (!isBase64Url(d) || !isBase64Url(x)) throw new Error('Generated keys are not base64url format');
  const dBytes = decodeBase64Url(d);
  const xBytes = decodeBase64Url(x);
  if (dBytes.length !== 32 || xBytes.length !== 32) {
    throw new Error(`Unexpected key byte lengths. d=${dBytes.length}, x=${xBytes.length} (expected 32 each)`);
  }
  return { d, x };
}

function generateJwtSecret() {
  // 48 bytes => 64 chars base64url-ish (depending), plenty > 32 char minimum
  return crypto.randomBytes(48).toString('base64url');
}

async function main() {
  const ops = await generateEd25519Pair();
  const root = await generateEd25519Pair();
  const jwtSecret = generateJwtSecret();

  console.log('');
  console.log('============================= OPS KEYS (Ed25519) =============================');
  console.log('OPS_ED25519_PRIVATE_KEY_B64=' + ops.d);
  console.log('OPS_ED25519_PUBLIC_KEY_B64=' + ops.x);
  // JWK & PEM (SPKI) for OPS public key
  const opsJwk = { kty: 'OKP', crv: 'Ed25519', x: ops.x };
  const opsKey = await importJWK(opsJwk, 'EdDSA');
  const opsSpki = await exportSPKI(opsKey);
  console.log('OPS_PUBLIC_KEY_JWK=' + JSON.stringify(opsJwk));
  console.log('OPS_PUBLIC_KEY_PEM=\n' + opsSpki.trim());
  console.log('==============================================================================');
  console.log('');

  console.log('====================== ROOT PRIVATE KEY (HANDLE WITH CARE) ====================');
  console.log('Store this value OFFLINE in an ultra secure location (HSM/offline vault).');
  console.log('ROOT_ED25519_PRIVATE_KEY_B64=' + root.d);
  console.log('==============================================================================');
  console.log('ROOT_ED25519_PUBLIC_KEY_B64=' + root.x);
  // JWK & PEM (SPKI) for ROOT public key
  const rootJwk = { kty: 'OKP', crv: 'Ed25519', x: root.x };
  const rootKey = await importJWK(rootJwk, 'EdDSA');
  const rootSpki = await exportSPKI(rootKey);
  console.log('ROOT_PUBLIC_KEY_JWK=' + JSON.stringify(rootJwk));
  console.log('ROOT_PUBLIC_KEY_PEM=\n' + rootSpki.trim());
  console.log('');

  console.log('=============================== JWT SECRET ===================================');
  console.log('JWT_SECRET=' + jwtSecret);
  console.log('==============================================================================');
  console.log('');
}

main().catch((err) => {
  console.error('Error generating development secrets:', err && err.message ? err.message : err);
  process.exit(1);
});


