/**
 * Ed25519Service Firmware Extension Tests
 *
 * Tests the getOpsPublicKeyB64, getOpsPublicKeyJwk, getOpsPublicKeyPem
 * methods and firmware JWT signing/verification.
 */

import { FIRMWARE_CHUNK_SIZE_BYTES } from '@/constants/firmware-chunk.constants';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

describe('Ed25519Service - Firmware Extensions', () => {
  describe('getOpsPublicKeyB64', () => {
    it('should return a string', () => {
      const key = Ed25519Service.getOpsPublicKeyB64();
      expect(typeof key).toBe('string');
    });

    it('should return a non-empty string in test mode (auto-generated key)', async () => {
      await Ed25519Service.signCommandJwt({ cmd_type: 'TEST' });
      const key = Ed25519Service.getOpsPublicKeyB64();
      expect(key.length).toBeGreaterThan(0);
    });

    it('should return consistent value across calls', () => {
      const key1 = Ed25519Service.getOpsPublicKeyB64();
      const key2 = Ed25519Service.getOpsPublicKeyB64();
      expect(key1).toBe(key2);
    });
  });

  describe('getOpsPublicKeyJwk', () => {
    it('should return a valid Ed25519 JWK with kty, crv, and x', async () => {
      await Ed25519Service.signCommandJwt({ cmd_type: 'TEST' });
      const jwk = Ed25519Service.getOpsPublicKeyJwk();
      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(typeof jwk.x).toBe('string');
      expect(jwk.x.length).toBeGreaterThan(0);
    });

    it('should have x matching getOpsPublicKeyB64', () => {
      const jwk = Ed25519Service.getOpsPublicKeyJwk();
      expect(jwk.x).toBe(Ed25519Service.getOpsPublicKeyB64());
    });

    it('should not include private key material (d)', () => {
      const jwk = Ed25519Service.getOpsPublicKeyJwk();
      expect(jwk).not.toHaveProperty('d');
    });
  });

  describe('getOpsPublicKeyPem', () => {
    it('should return a valid SPKI PEM string', async () => {
      await Ed25519Service.signCommandJwt({ cmd_type: 'TEST' });
      const pem = await Ed25519Service.getOpsPublicKeyPem();
      expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(pem).toContain('-----END PUBLIC KEY-----');
    });

    it('should return consistent PEM across calls', async () => {
      const pem1 = await Ed25519Service.getOpsPublicKeyPem();
      const pem2 = await Ed25519Service.getOpsPublicKeyPem();
      expect(pem1).toBe(pem2);
    });
  });

  describe('firmware manifest JWT', () => {
    it('should sign a FIRMWARE_MANIFEST JWT', async () => {
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_MANIFEST',
        version: '2.0.0',
        sha256: 'abc123',
        size: 1024,
        chunk_count: 4,
        chunk_size: FIRMWARE_CHUNK_SIZE_BYTES,
        nonce: 'test-nonce',
        compatible_models: ['BLK-100'],
      });

      expect(typeof jwt).toBe('string');
      expect(jwt.split('.')).toHaveLength(3);
    });

    it('should be verifiable with verifyJwt', async () => {
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_MANIFEST',
        version: '2.0.0',
        sha256: 'abc123',
      });

      const payload = await Ed25519Service.verifyJwt(jwt);
      expect(payload.cmd_type).toBe('FIRMWARE_MANIFEST');
      expect(payload.version).toBe('2.0.0');
      expect(payload.iss).toBe('BluCloud:Root');
    });

    it('should include filename and target_type when provided', async () => {
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_MANIFEST',
        target_type: 'access_control',
        filename: 'ac-fw-1.0.0.bin',
        version: '1.0.0',
        sha256: 'def456',
        size: 2048,
        chunk_count: 1,
        chunk_size: FIRMWARE_CHUNK_SIZE_BYTES,
        nonce: 'nonce-123',
        compatible_models: [],
      });

      const payload = await Ed25519Service.verifyJwt(jwt);
      expect(payload.target_type).toBe('access_control');
      expect(payload.filename).toBe('ac-fw-1.0.0.bin');
      expect(payload.version).toBe('1.0.0');
    });

    it('should use optional ttlSeconds for exp claim (default 1800)', async () => {
      const jwt = await Ed25519Service.signCommandJwt({ cmd_type: 'TEST' });
      const payload = await Ed25519Service.verifyJwt(jwt);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBe(payload.iat + 1800);
    });

    it('should use custom ttlSeconds when provided', async () => {
      const jwt = await Ed25519Service.signCommandJwt({ cmd_type: 'TEST' }, 3600);
      const payload = await Ed25519Service.verifyJwt(jwt);
      expect(payload.exp).toBe(payload.iat + 3600);
    });
  });

  describe('firmware chunk JWT', () => {
    it('should sign a FIRMWARE_CHUNK JWT', async () => {
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_CHUNK',
        nonce: 'test-nonce',
        chunk_index: 0,
        chunk_sha256: 'chunk-hash-0',
        data: Buffer.alloc(100).toString('base64'),
      });

      expect(typeof jwt).toBe('string');
      expect(jwt.split('.')).toHaveLength(3);
    });

    it('should be verifiable with verifyJwt', async () => {
      const chunkData = Buffer.alloc(100).toString('base64');
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_CHUNK',
        nonce: 'test-nonce',
        chunk_index: 2,
        chunk_sha256: 'chunk-hash-2',
        data: chunkData,
      });

      const payload = await Ed25519Service.verifyJwt(jwt);
      expect(payload.cmd_type).toBe('FIRMWARE_CHUNK');
      expect(payload.chunk_index).toBe(2);
      expect(payload.data).toBe(chunkData);
    });
  });
});
