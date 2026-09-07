import * as crypto from 'crypto';
import { SignJWT, importPKCS8 } from 'jose';
import {
  FIRMWARE_CHUNK_SIZE_BYTES,
  FIRMWARE_CHUNK_WIRE_BUDGET_RATIO,
  GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT,
} from '@/constants/firmware-chunk.constants';

describe('firmware-chunk.constants', () => {
  it('FIRMWARE_CHUNK_SIZE_BYTES fits within 80% of default WS max with real JWT envelope', async () => {
    const wireBudget = Math.floor(GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT * FIRMWARE_CHUNK_WIRE_BUDGET_RATIO);
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const pk = await importPKCS8(
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      'EdDSA',
    );

    const chunkData = crypto.randomBytes(FIRMWARE_CHUNK_SIZE_BYTES);
    const payload = {
      iss: 'BluCloud:Root',
      cmd_type: 'FIRMWARE_CHUNK',
      target_type: 'lock',
      nonce: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      chunk_index: 0,
      chunk_sha256: crypto.createHash('sha256').update(chunkData).digest('hex'),
      data: chunkData.toString('base64'),
    };
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: 'ops-v1' })
      .setIssuedAt(now)
      .setExpirationTime(now + 1800)
      .sign(pk);

    const wireBytes = JSON.stringify({ type: 'FIRMWARE_CHUNK', jwt }).length;
    expect(wireBytes).toBeLessThanOrEqual(wireBudget);
    expect(wireBytes).toBeGreaterThan(wireBudget * 0.99);
  });
});
