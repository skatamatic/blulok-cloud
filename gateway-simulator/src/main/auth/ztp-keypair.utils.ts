import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'crypto';

export const ZTP_PROVISION_PREFIX = 'blulok-ztp-v1';
export const ZTP_GW_AUTH_PREFIX = 'blulok-gw-auth-v1';

export function buildZtpSignPayload(prefix: string, nonce: string, deviceId: string): Buffer {
  return Buffer.concat([
    Buffer.from(prefix, 'utf8'),
    Buffer.from([0]),
    Buffer.from(nonce, 'utf8'),
    Buffer.from([0]),
    Buffer.from(deviceId, 'utf8'),
  ]);
}

export function generateP256KeyPair(): {
  publicKeyCompressedB64url: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    publicKeyCompressedB64url: spkiPemToCompressedB64url(publicKeyPem),
    privateKeyPem,
  };
}

export function signZtpPayload(privateKeyPem: string, payload: Buffer): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign('sha256', payload, key);
  return bufToB64url(sig);
}

function spkiPemToCompressedB64url(pem: string): string {
  const key = createPublicKey(pem);
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer;
  const uncompressed = der.subarray(der.length - 65);
  if (uncompressed[0] !== 0x04) throw new Error('Unexpected SPKI encoding');
  const x = uncompressed.subarray(1, 33);
  const y = uncompressed.subarray(33, 65);
  const prefix = (y[y.length - 1] & 1) === 0 ? 0x02 : 0x03;
  return bufToB64url(Buffer.concat([Buffer.from([prefix]), x]));
}

function bufToB64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
