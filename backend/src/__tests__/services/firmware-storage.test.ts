/**
 * Firmware Storage Factory Unit Tests
 */

import {
  getFirmwareStorageProviderSync,
  validateFirmwareFile,
  clearFirmwareStorageCache,
  FIRMWARE_MAX_SIZE_BYTES,
} from '@/services/firmware/firmware-storage.factory';

describe('Firmware Storage Factory', () => {
  beforeEach(() => {
    clearFirmwareStorageCache();
  });

  describe('getFirmwareStorageProviderSync', () => {
    it('should return a storage provider', () => {
      const provider = getFirmwareStorageProviderSync();
      expect(provider).toBeDefined();
      expect(typeof provider.initialize).toBe('function');
      expect(typeof provider.upload).toBe('function');
      expect(typeof provider.download).toBe('function');
      expect(typeof provider.remove).toBe('function');
      expect(typeof provider.supportsSignedDownload).toBe('function');
      expect(typeof provider.createSignedDownloadUrl).toBe('function');
    });

    it('GCS fallback supports signed download', () => {
      const provider = getFirmwareStorageProviderSync();
      expect(provider.supportsSignedDownload()).toBe(true);
    });

    it('should return cached instance on subsequent calls', () => {
      const provider1 = getFirmwareStorageProviderSync();
      const provider2 = getFirmwareStorageProviderSync();
      expect(provider1).toBe(provider2);
    });

    it('should return new instance after cache clear', () => {
      const provider1 = getFirmwareStorageProviderSync();
      clearFirmwareStorageCache();
      const provider2 = getFirmwareStorageProviderSync();
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('validateFirmwareFile', () => {
    it('should accept any file extension', () => {
      expect(validateFirmwareFile('firmware.bin', 1024)).toHaveLength(0);
      expect(validateFirmwareFile('firmware.zip', 1024)).toHaveLength(0);
      expect(validateFirmwareFile('firmware.hex', 1024)).toHaveLength(0);
      expect(validateFirmwareFile('update.tar.gz', 1024)).toHaveLength(0);
      expect(validateFirmwareFile('image.img', 1024)).toHaveLength(0);
    });

    it('should reject files exceeding max size', () => {
      const errors = validateFirmwareFile('big.zip', FIRMWARE_MAX_SIZE_BYTES + 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('exceeds maximum');
    });

    it('should accept files at max size', () => {
      const errors = validateFirmwareFile('exact.zip', FIRMWARE_MAX_SIZE_BYTES);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty files', () => {
      const errors = validateFirmwareFile('empty.zip', 0);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('empty');
    });

    it('should report only size error for oversized file', () => {
      const errors = validateFirmwareFile('big.zip', FIRMWARE_MAX_SIZE_BYTES + 1);
      expect(errors).toHaveLength(1);
    });
  });
});
