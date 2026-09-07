import { createPublicKey, createPrivateKey, generateKeyPairSync, sign, verify, timingSafeEqual, KeyObject } from 'crypto';


/** Domain separation for provisioning challenge signatures. */
export const ZTP_PROVISION_PREFIX = 'blulok-ztp-v1';
/** Domain separation for operational /ws/gateway AUTH proofs. */
export const ZTP_GW_AUTH_PREFIX = 'blulok-gw-auth-v1';

/**
 * Build the exact bytes signed for challenge-response:
 * UTF-8(prefix) || 0x00 || UTF-8(nonce) || 0x00 || UTF-8(deviceId)
 */
export function buildZtpSignPayload(prefix: string, nonce: string, deviceId: string): Buffer {
  return Buffer.concat([
    Buffer.from(prefix, 'utf8'),
    Buffer.from([0]),
    Buffer.from(nonce, 'utf8'),
    Buffer.from([0]),
    Buffer.from(deviceId, 'utf8'),
  ]);
}

/** Generate an ECDSA P-256 keypair for tests / Tier-0 lab. */
export function generateP256KeyPair(): {
  publicKeyCompressedB64url: string;
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyCompressedB64url = spkiPemToCompressedB64url(publicKeyPem);
  return { publicKeyCompressedB64url, privateKeyPem, publicKeyPem };
}

export function spkiPemToCompressedB64url(pem: string): string {
  const key = createPublicKey(pem);
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer;
  // SPKI for P-256 uncompressed point is last 65 bytes (0x04 || X || Y)
  const uncompressed = der.subarray(der.length - 65);
  if (uncompressed[0] !== 0x04 || uncompressed.length !== 65) {
    throw new Error('Unexpected SPKI public key encoding');
  }
  const x = uncompressed.subarray(1, 33);
  const y = uncompressed.subarray(33, 65);
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
  const compressed = Buffer.concat([Buffer.from([prefix]), x]);
  return bufferToB64url(compressed);
}

export function compressedB64urlToKeyObject(publicKeyCompressedB64url: string): KeyObject {
  const compressed = b64urlToBuffer(publicKeyCompressedB64url);
  if (compressed.length !== 33 || (compressed[0] !== 0x02 && compressed[0] !== 0x03)) {
    throw new Error('Invalid compressed P-256 public key');
  }
  // Build uncompressed SEC1 point for SPKI (Node needs full point for createPublicKey from raw)
  const uncompressed = decompressP256(compressed);
  const spki = Buffer.concat([
    Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
    uncompressed,
  ]);
  return createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

/** True when the string is a valid compressed P-256 point (on-curve). */
export function isValidCompressedPublicKey(publicKeyCompressedB64url: string): boolean {
  try {
    compressedB64urlToKeyObject(publicKeyCompressedB64url);
    return true;
  } catch {
    return false;
  }
}

/** Sign payload with PKCS8 PEM private key; return base64url DER signature. */
export function signZtpPayload(privateKeyPem: string, payload: Buffer): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign('sha256', payload, key);
  return bufferToB64url(sig);
}

/** Verify base64url DER ECDSA signature against compressed pubkey. */
export function verifyZtpSignature(
  publicKeyCompressedB64url: string,
  payload: Buffer,
  signatureB64url: string,
): boolean {
  try {
    const key = compressedB64urlToKeyObject(publicKeyCompressedB64url);
    const signature = b64urlToBuffer(signatureB64url);
    return verify('sha256', payload, key, signature);
  } catch {
    return false;
  }
}

export function constantTimeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    const dummy = Buffer.alloc(ba.length);
    timingSafeEqual(ba, dummy);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function bufferToB64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function b64urlToBuffer(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/**
 * Decompress a compressed P-256 point (33 bytes) to uncompressed (65 bytes).
 * Uses Node's KeyObject by reconstructing via JWK when available.
 */
function decompressP256(compressed: Buffer): Buffer {
  const prefix = compressed[0];
  const x = compressed.subarray(1);
  // P-256 prime and curve params
  const p = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  const a = p - 3n;
  const b = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
  const xInt = bigIntFromBuf(x);
  const y2 = mod(mod(xInt * xInt, p) * xInt + a * xInt + b, p);
  let y = modPow(y2, (p + 1n) / 4n, p);
  const yOdd = (y & 1n) === 1n;
  const wantOdd = prefix === 0x03;
  if (yOdd !== wantOdd) {
    y = mod(p - y, p);
  }
  // Reject invalid points (not on curve / not a quadratic residue)
  if (mod(y * y, p) !== y2) {
    throw new Error('Invalid compressed P-256 point (not on curve)');
  }
  const yBuf = bigIntToBuf32(y);
  return Buffer.concat([Buffer.from([0x04]), x, yBuf]);
}

function mod(n: bigint, m: bigint): bigint {
  const r = n % m;
  return r >= 0n ? r : r + m;
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return result;
}

function bigIntFromBuf(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex'));
}

function bigIntToBuf32(n: bigint): Buffer {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex.padStart(64, '0'), 'hex');
  return buf.length === 32 ? buf : buf.subarray(buf.length - 32);
}
