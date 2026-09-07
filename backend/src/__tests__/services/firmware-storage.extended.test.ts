/**
 * Extended Firmware Storage Factory coverage — adapter + async factory paths.
 */

import crypto from 'crypto';
import { StorageProviderType } from '@/services/storage';

const mockBaseStorage: any = {
  type: StorageProviderType.LOCAL,
  initialize: jest.fn().mockResolvedValue(undefined),
  fileExists: jest.fn().mockResolvedValue(true),
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('firmware-bytes')),
  uploadFile: jest.fn().mockResolvedValue(undefined),
  deleteFile: jest.fn().mockResolvedValue(undefined),
  createResumableUploadSession: jest.fn().mockResolvedValue({
    url: 'https://upload.example/session',
    headers: { 'x-gcs': '1' },
  }),
  createSignedDownloadUrl: jest.fn().mockResolvedValue('https://download.example/file'),
  getFileSize: jest.fn().mockResolvedValue(42),
  hashFileSha256: jest.fn().mockResolvedValue('abc123'),
};

const mockCreateBase = jest.fn((config: { type: StorageProviderType }) => {
  mockBaseStorage.type = config.type;
  return mockBaseStorage;
});
const mockClearBase = jest.fn();

jest.mock('@/services/storage', () => {
  const actual = jest.requireActual('@/services/storage');
  return {
    ...actual,
    createBaseStorageProvider: (...args: unknown[]) => mockCreateBase(...args),
    clearBaseProviderCache: (...args: unknown[]) => mockClearBase(...args),
  };
});

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockWhere = jest.fn();
const mockFirst = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockDbFn = { now: jest.fn(() => 'NOW') };
const mockDbRaw = jest.fn((s: string) => s);

function buildDb() {
  const chain: any = {
    where: mockWhere,
    first: mockFirst,
    update: mockUpdate,
    insert: mockInsert,
    fn: mockDbFn,
    raw: mockDbRaw,
  };
  mockWhere.mockReturnValue(chain);
  const db: any = jest.fn(() => chain);
  db.fn = mockDbFn;
  db.raw = mockDbRaw;
  return db;
}

let mockDb = buildDb();

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      get connection() {
        return mockDb;
      },
    }),
  },
}));

jest.mock('@/services/provisioning/provisioning-storage.factory', () => ({
  clearProvisioningStorageCache: jest.fn(),
}));

import { clearProvisioningStorageCache } from '@/services/provisioning/provisioning-storage.factory';
const mockClearProvisioning = clearProvisioningStorageCache as jest.Mock;

import {
  buildFirmwareStorageProvider,
  getFirmwareStorageProvider,
  getFirmwareStorageProviderSync,
  saveFirmwareStorageConfig,
  clearFirmwareStorageCache,
  validateFirmwareFile,
  FIRMWARE_MAX_SIZE_BYTES,
} from '@/services/firmware/firmware-storage.factory';

describe('firmware-storage.factory (extended)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFirmwareStorageCache();
    mockBaseStorage.type = StorageProviderType.LOCAL;
    mockDb = buildDb();
    mockFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue(1);
    mockInsert.mockResolvedValue(1);
  });

  describe('buildFirmwareStorageProvider / adapter', () => {
    it('initializes and reports signed support based on type', async () => {
      const local = buildFirmwareStorageProvider(StorageProviderType.LOCAL, { basePath: '/tmp' });
      await local.initialize();
      expect(local.supportsSignedUpload()).toBe(false);
      expect(local.supportsSignedDownload()).toBe(false);

      mockBaseStorage.type = StorageProviderType.GCS;
      const gcs = buildFirmwareStorageProvider(StorageProviderType.GCS, {
        projectId: 'p',
        bucketName: 'b',
      });
      expect(gcs.supportsSignedUpload()).toBe(true);
      expect(gcs.supportsSignedDownload()).toBe(true);
    });

    it('buildStoragePath sanitizes filename and rejects traversal', () => {
      const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});
      expect(provider.buildStoragePath('fw-1', '/evil/../update.bin')).toBe('firmware/fw-1/update.bin');
      expect(() => provider.buildStoragePath('fw-1', '..')).toThrow(/Invalid firmware filename/);
      expect(() => provider.buildStoragePath('fw-1', '.')).toThrow(/Invalid firmware filename/);
    });

    it('createSignedUploadSession requires GCS and returns session', async () => {
      mockBaseStorage.type = StorageProviderType.LOCAL;
      const local = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});
      await expect(local.createSignedUploadSession('fw', 'a.bin', 10)).rejects.toThrow(
        /Signed upload is not supported/,
      );

      mockBaseStorage.type = StorageProviderType.GCS;
      const gcs = buildFirmwareStorageProvider(StorageProviderType.GCS, {});
      const session = await gcs.createSignedUploadSession('fw-1', 'a.bin', 100, 'https://app');
      expect(session).toMatchObject({
        upload_id: 'fw-1',
        storage_path: 'firmware/fw-1/a.bin',
        upload_url: 'https://upload.example/session',
        expires_in_seconds: 3600,
      });
      expect(mockBaseStorage.createResumableUploadSession).toHaveBeenCalledWith(
        'firmware/fw-1/a.bin',
        expect.objectContaining({ contentType: 'application/octet-stream', origin: 'https://app' }),
      );
    });

    it('createSignedDownloadUrl requires GCS and validates path', async () => {
      mockBaseStorage.type = StorageProviderType.LOCAL;
      const local = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});
      await expect(local.createSignedDownloadUrl('firmware/x/a.bin', 60)).rejects.toThrow(
        /Signed download is not supported/,
      );

      mockBaseStorage.type = StorageProviderType.GCS;
      const gcs = buildFirmwareStorageProvider(StorageProviderType.GCS, {});
      await expect(gcs.createSignedDownloadUrl('other/x.bin', 60)).rejects.toThrow(
        /Path does not reference firmware/,
      );
      await expect(gcs.createSignedDownloadUrl('firmware/../escape.bin', 60)).rejects.toThrow(
        /Path traversal/,
      );
      await expect(gcs.createSignedDownloadUrl('firmware/fw/a.bin', 120)).resolves.toBe(
        'https://download.example/file',
      );
    });

    it('fileExists / getStoredFileSize / hashStoredFile for local and GCS', async () => {
      mockBaseStorage.type = StorageProviderType.LOCAL;
      const local = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});
      await expect(local.fileExists('firmware/fw/a.bin')).resolves.toBe(true);
      await expect(local.getStoredFileSize('firmware/fw/a.bin')).resolves.toBe(
        Buffer.from('firmware-bytes').length,
      );
      const hash = await local.hashStoredFile('firmware/fw/a.bin');
      expect(hash).toBe(
        crypto.createHash('sha256').update(Buffer.from('firmware-bytes')).digest('hex'),
      );

      mockBaseStorage.type = StorageProviderType.GCS;
      const gcs = buildFirmwareStorageProvider(StorageProviderType.GCS, {});
      await expect(gcs.getStoredFileSize('firmware/fw/a.bin')).resolves.toBe(42);
      await expect(gcs.hashStoredFile('firmware/fw/a.bin')).resolves.toBe('abc123');
    });

    it('upload / download / remove', async () => {
      const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});
      await expect(provider.upload('fw-1', 'a.bin', Buffer.from('x'))).resolves.toBe(
        'firmware/fw-1/a.bin',
      );
      expect(mockBaseStorage.uploadFile).toHaveBeenCalledWith(
        'firmware/fw-1/a.bin',
        Buffer.from('x'),
        'application/octet-stream',
      );

      await expect(provider.download('firmware/fw-1/a.bin')).resolves.toEqual(
        Buffer.from('firmware-bytes'),
      );

      await provider.remove('firmware/fw-1/a.bin');
      expect(mockBaseStorage.deleteFile).toHaveBeenCalledWith('firmware/fw-1/a.bin');

      mockBaseStorage.deleteFile.mockRejectedValueOnce(new Error('gone'));
      await expect(provider.remove('firmware/fw-1/a.bin')).resolves.toBeUndefined();
    });
  });

  describe('getFirmwareStorageProvider', () => {
    it('falls back to GCS when DB has no config', async () => {
      mockFirst.mockResolvedValue(null);
      const provider = await getFirmwareStorageProvider();
      expect(mockCreateBase).toHaveBeenCalledWith(
        expect.objectContaining({ type: StorageProviderType.GCS }),
      );
      expect(provider).toBeDefined();

      // cache hit
      mockCreateBase.mockClear();
      const again = await getFirmwareStorageProvider();
      expect(again).toBe(provider);
      expect(mockCreateBase).not.toHaveBeenCalled();
    });

    it('builds from DB config when present', async () => {
      mockFirst
        .mockResolvedValueOnce({ value: StorageProviderType.LOCAL })
        .mockResolvedValueOnce({ value: JSON.stringify({ basePath: '/data/fw' }) });

      clearFirmwareStorageCache();
      const provider = await getFirmwareStorageProvider();
      expect(mockCreateBase).toHaveBeenCalledWith({
        type: StorageProviderType.LOCAL,
        config: { basePath: '/data/fw' },
      });
      expect(provider.supportsSignedUpload()).toBe(false);
    });

    it('treats DB load errors as null config', async () => {
      mockFirst.mockRejectedValue(new Error('db down'));
      clearFirmwareStorageCache();
      const provider = await getFirmwareStorageProvider();
      expect(provider).toBeDefined();
      expect(mockCreateBase).toHaveBeenCalled();
    });
  });

  describe('getFirmwareStorageProviderSync', () => {
    it('returns cached provider when available', async () => {
      const asyncProvider = await getFirmwareStorageProvider();
      const syncProvider = getFirmwareStorageProviderSync();
      expect(syncProvider).toBe(asyncProvider);
    });

    it('creates GCS fallback when cache empty', () => {
      clearFirmwareStorageCache();
      const provider = getFirmwareStorageProviderSync();
      expect(provider.supportsSignedDownload()).toBe(true);
    });
  });

  describe('saveFirmwareStorageConfig', () => {
    it('inserts when rows missing and invalidates caches', async () => {
      mockFirst.mockResolvedValue(null);
      await saveFirmwareStorageConfig(StorageProviderType.GCS, { projectId: 'p', bucketName: 'b' });
      expect(mockInsert).toHaveBeenCalled();
      expect(mockClearProvisioning).toHaveBeenCalled();
    });

    it('updates when rows exist', async () => {
      mockFirst.mockResolvedValue({ key: 'storage.firmware.provider_type', value: 'local' });
      await saveFirmwareStorageConfig(StorageProviderType.LOCAL, { basePath: '/x' });
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('validateFirmwareFile', () => {
    it('covers empty and oversized', () => {
      expect(validateFirmwareFile('a.bin', 0)[0]).toMatch(/empty/);
      expect(validateFirmwareFile('a.bin', FIRMWARE_MAX_SIZE_BYTES + 1)[0]).toMatch(/exceeds/);
    });
  });
});
