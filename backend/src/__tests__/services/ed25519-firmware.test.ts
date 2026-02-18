/**
 * Ed25519Service Firmware Extension Tests
 *
 * Tests the getOpsPublicKeyB64 method and firmware JWT signing/verification.
 */

import { Ed25519Service } from '@/services/crypto/ed25519.service';

describe('Ed25519Service - Firmware Extensions', () => {
  describe('getOpsPublicKeyB64', () => {
    it('should return a string', () => {
      const key = Ed25519Service.getOpsPublicKeyB64();
      expect(typeof key).toBe('string');
    });

    it('should return a non-empty string in test mode (auto-generated key)', async () => {
      // Force key generation by calling signCommandJwt first
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

  describe('firmware manifest JWT', () => {
    it('should sign a FIRMWARE_MANIFEST JWT', async () => {
      const jwt = await Ed25519Service.signCommandJwt({
        cmd_type: 'FIRMWARE_MANIFEST',
        version: '2.0.0',
        sha256: 'abc123',
        size: 1024,
        chunk_count: 4,
        chunk_size: 256 * 1024,
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
