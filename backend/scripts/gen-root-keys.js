/*
 * Generate Ed25519 ROOT keys for BluLok Cloud
 *
 * CRITICAL SECURITY WARNING:
 *   - The ROOT PRIVATE KEY grants authority to verify/rotate Ops keys and other root trust operations.
 *   - STORE THE PRIVATE KEY OFFLINE in an ultra secure location (HSM, offline vault).
 *   - DO NOT COMMIT, DO NOT EMAIL, DO NOT SHARE.
 *
 * Usage:
 *   node scripts/gen-root-keys.js
 *
 * Output:
 *   - Prints ROOT private key (d) ONCE to stdout with explicit warnings
 *   - Prints .env line for ROOT_ED25519_PUBLIC_KEY_B64 (x)
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

  // IMPORTANT: Show private key with strong warnings
  console.log('');
  console.log('====================== ROOT PRIVATE KEY (DO NOT STORE IN REPO) ======================');
  console.log('Store this value OFFLINE in an ultra secure location (HSM, vault, air-gapped).');
  console.log('ROOT_ED25519_PRIVATE_KEY_B64=' + d);
  console.log('====================================================================================');
  console.log('');

  // Print .env line for root public key (safe to store in environment)
  console.log('ROOT_ED25519_PUBLIC_KEY_B64=' + x);
  console.log('');
  console.log(`# Info: base64url-encoded JWK components; byte lengths d=${dBytes.length}, x=${xBytes.length}`);
}

main().catch((err) => {
  console.error('Error generating ROOT keys:', err && err.message ? err.message : err);
  process.exit(1);
});


