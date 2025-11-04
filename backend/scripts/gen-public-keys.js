/*
  Generate PEM (SPKI) and JWK public keys for OPS and ROOT Ed25519 keys from environment variables.
  Usage: npm run gen:public_keys

  Reads:
    OPS_ED25519_PUBLIC_KEY_B64
    OPS_ED25519_PRIVATE_KEY_B64 (optional; only used to derive public key if public missing)
    ROOT_ED25519_PUBLIC_KEY_B64
    ROOT_ED25519_PRIVATE_KEY_B64 (optional; only used to derive public key if public missing)
*/

require('dotenv').config();
const { importJWK, exportSPKI, exportJWK } = require('jose');

async function derivePublicFromPrivateB64(privateB64) {
  if (!privateB64) return undefined;
  try {
    const privateJwk = { kty: 'OKP', crv: 'Ed25519', d: privateB64 };
    const privKey = await importJWK(privateJwk, 'EdDSA');
    const jwkOut = await exportJWK(privKey);
    return jwkOut.x; // base64url public
  } catch (_e) {
    return undefined;
  }
}

async function emitFor(label, publicB64) {
  if (!publicB64) {
    console.log(`\n[${label}] No public key available.`);
    return;
  }
  const jwk = { kty: 'OKP', crv: 'Ed25519', x: publicB64 };
  const key = await importJWK(jwk, 'EdDSA');
  const spki = await exportSPKI(key);

  console.log(`\n[${label}] Public Key - JWK:`);
  console.log(JSON.stringify(jwk, null, 2));
  console.log(`\n[${label}] Public Key - PEM (SPKI):`);
  console.log(spki.trim());
}

(async () => {
  const opsPubB64 = process.env.OPS_ED25519_PUBLIC_KEY_B64 || (await derivePublicFromPrivateB64(process.env.OPS_ED25519_PRIVATE_KEY_B64));
  const rootPubB64 = process.env.ROOT_ED25519_PUBLIC_KEY_B64 || (await derivePublicFromPrivateB64(process.env.ROOT_ED25519_PRIVATE_KEY_B64));

  console.log('Generating public keys from environment variables...');
  await emitFor('OPS', opsPubB64);
  await emitFor('ROOT', rootPubB64);
})();


