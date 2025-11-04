/*
 * Generate Ed25519 Ops keys for BluLok Cloud
 *
 * Usage:
 *   node scripts/gen-ops-keys.js
 *
 * Output:
 *   Prints .env lines for OPS_ED25519_PRIVATE_KEY_B64 and OPS_ED25519_PUBLIC_KEY_B64
 *   Values are base64url-encoded JWK components suitable for jose.importJWK
 */

const { generateKeyPair, exportJWK } = require('jose');

function isBase64Url(str) {
  return /^[A-Za-z0-9_-]+$/.test(str);
}

function decodeBase64Url(str) {
  return Buffer.from(str, 'base64url');
}

async function main() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);

  const d = jwkPriv && jwkPriv.d;
  const x = jwkPub && jwkPub.x;

  if (!d || !x) {
    throw new Error('Failed to export JWK components (d/x)');
  }

  if (!isBase64Url(d) || !isBase64Url(x)) {
    throw new Error('Generated keys are not base64url format as expected');
  }

  const dBytes = decodeBase64Url(d);
  const xBytes = decodeBase64Url(x);

  if (dBytes.length !== 32 || xBytes.length !== 32) {
    throw new Error(`Unexpected key byte lengths. d=${dBytes.length}, x=${xBytes.length} (expected 32 each)`);
  }

  // Print .env lines
  console.log('OPS_ED25519_PRIVATE_KEY_B64=' + d);
  console.log('OPS_ED25519_PUBLIC_KEY_B64=' + x);
  console.log('');
  console.log(`# Info: both values are base64url-encoded; length (bytes) d=${dBytes.length}, x=${xBytes.length}`);
}

main().catch((err) => {
  console.error('Error generating keys:', err && err.message ? err.message : err);
  process.exit(1);
});


