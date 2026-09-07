/**
 * FirmwareStorageAdapter + async factory / DB config coverage.
 */
import { StorageProviderType } from '@/services/storage';

const mockCreateBaseStorageProvider = jest.fn();
const mockClearBaseProviderCache = jest.fn();

jest.mock('@/services/storage', () => {
  const actual = jest.requireActual('@/services/storage');
  return {
    ...actual,
    createBaseStorageProvider: (...args: unknown[]) => mockCreateBaseStorageProvider(...args),
    clearBaseProviderCache: (...args: unknown[]) => mockClearBaseProviderCache(...args),
  };
});

const mockClearProvisioningStorageCache = jest.fn();
jest.mock('@/services/provisioning/provisioning-storage.factory', () => ({
  clearProvisioningStorageCache: (...args: unknown[]) => mockClearProvisioningStorageCache(...args),
}));

const mockDb = jest.fn();
(mockDb as unknown as { fn: { now: jest.Mock }; raw: jest.Mock }).fn = {
  now: jest.fn(() => 'NOW()'),
};
(mockDb as unknown as { raw: jest.Mock }).raw = jest.fn((sql: string) => sql);

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: mockDb })),
  },
}));

import {
  buildFirmwareStorageProvider,
  clearFirmwareStorageCache,
  getFirmwareStorageProvider,
  getFirmwareStorageProviderSync,
  saveFirmwareStorageConfig,
} from '@/services/firmware/firmware-storage.factory';

function makeLocalBase(overrides: Record<string, unknown> = {}) {
  return {
    type: StorageProviderType.LOCAL,
    initialize: jest.fn().mockResolvedValue(undefined),
    uploadFile: jest.fn().mockResolvedValue(undefined),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('bin-data')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    fileExists: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeGcsBase(overrides: Record<string, unknown> = {}) {
  return {
    type: StorageProviderType.GCS,
    initialize: jest.fn().mockResolvedValue(undefined),
    uploadFile: jest.fn().mockResolvedValue(undefined),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('gcs')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    fileExists: jest.fn().mockResolvedValue(true),
    createResumableUploadSession: jest.fn().mockResolvedValue({
      url: 'https://upload.example/session',
      headers: { 'x-goog': '1' },
    }),
    createSignedDownloadUrl: jest.fn().mockResolvedValue('https://download.example/fw'),
    getFileSize: jest.fn().mockResolvedValue(42),
    hashFileSha256: jest.fn().mockResolvedValue('abc123'),
    ...overrides,
  };
}

describe('FirmwareStorageAdapter via buildFirmwareStorageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFirmwareStorageCache();
  });

  it('builds path and rejects invalid filenames', () => {
    mockCreateBaseStorageProvider.mockReturnValue(makeLocalBase());
    const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, { basePath: './fw' });

    expect(provider.buildStoragePath('fw-1', 'app.bin')).toBe('firmware/fw-1/app.bin');
    expect(() => provider.buildStoragePath('fw-1', '..')).toThrow(/Invalid firmware filename/);
  });

  it('local provider rejects signed upload/download', async () => {
    mockCreateBaseStorageProvider.mockReturnValue(makeLocalBase());
    const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});

    expect(provider.supportsSignedUpload()).toBe(false);
    expect(provider.supportsSignedDownload()).toBe(false);
    await expect(provider.createSignedUploadSession('fw-1', 'a.bin', 10)).rejects.toThrow(
      /Signed upload is not supported/,
    );
    await expect(provider.createSignedDownloadUrl('firmware/fw-1/a.bin', 60)).rejects.toThrow(
      /Signed download is not supported/,
    );
  });

  it('GCS signed upload/download and metadata helpers', async () => {
    const gcs = makeGcsBase();
    mockCreateBaseStorageProvider.mockReturnValue(gcs);
    const provider = buildFirmwareStorageProvider(StorageProviderType.GCS, {
      projectId: 'p',
      bucketName: 'b',
    });

    await provider.initialize();
    expect(gcs.initialize).toHaveBeenCalled();

    const session = await provider.createSignedUploadSession('fw-1', 'a.bin', 100, 'https://app');
    expect(session).toEqual(
      expect.objectContaining({
        upload_id: 'fw-1',
        storage_path: 'firmware/fw-1/a.bin',
        upload_url: 'https://upload.example/session',
        expires_in_seconds: 3600,
      }),
    );
    expect(gcs.createResumableUploadSession).toHaveBeenCalledWith(
      'firmware/fw-1/a.bin',
      expect.objectContaining({ origin: 'https://app' }),
    );

    await expect(provider.createSignedDownloadUrl('firmware/fw-1/a.bin', 120)).resolves.toBe(
      'https://download.example/fw',
    );
    await expect(provider.getStoredFileSize('firmware/fw-1/a.bin')).resolves.toBe(42);
    await expect(provider.hashStoredFile('firmware/fw-1/a.bin')).resolves.toBe('abc123');
  });

  it('local getStoredFileSize/hashStoredFile download the file', async () => {
    const local = makeLocalBase({
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('abcd')),
    });
    mockCreateBaseStorageProvider.mockReturnValue(local);
    const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});

    await expect(provider.getStoredFileSize('firmware/fw-1/a.bin')).resolves.toBe(4);
    const hash = await provider.hashStoredFile('firmware/fw-1/a.bin');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('upload/download/remove and path validation', async () => {
    const local = makeLocalBase();
    mockCreateBaseStorageProvider.mockReturnValue(local);
    const provider = buildFirmwareStorageProvider(StorageProviderType.LOCAL, {});

    await expect(provider.upload('fw-1', 'a.bin', Buffer.from('x'))).resolves.toBe(
      'firmware/fw-1/a.bin',
    );
    await expect(provider.download('firmware/fw-1/a.bin')).resolves.toEqual(Buffer.from('bin-data'));
    await expect(provider.fileExists('firmware/fw-1/a.bin')).resolves.toBe(true);

    await expect(provider.download('other/path.bin')).rejects.toThrow(/does not reference firmware/);
    await expect(provider.download('firmware/../etc/passwd')).rejects.toThrow(/Path traversal/);

    await provider.remove('firmware/fw-1/a.bin');
    expect(local.deleteFile).toHaveBeenCalledWith('firmware/fw-1/a.bin');

    local.deleteFile.mockRejectedValueOnce(new Error('gone'));
    await expect(provider.remove('firmware/fw-1/a.bin')).resolves.toBeUndefined();
  });
});

describe('getFirmwareStorageProvider / saveFirmwareStorageConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFirmwareStorageCache();
    mockCreateBaseStorageProvider.mockReturnValue(makeGcsBase());
  });

  function mockSettingsRows(typeValue: string | null, configValue: string | null) {
    mockDb.mockImplementation(() => {
      const chain: {
        where: jest.Mock;
        first: jest.Mock;
        update: jest.Mock;
        insert: jest.Mock;
      } = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn(),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockResolvedValue(1),
      };
      let call = 0;
      chain.first.mockImplementation(async () => {
        call += 1;
        // loadFirmwareStorageConfig: type then config
        if (call === 1) return typeValue ? { key: 'storage.firmware.provider_type', value: typeValue } : null;
        if (call === 2) return configValue ? { key: 'storage.firmware.provider_config', value: configValue } : null;
        return null;
      });
      return chain;
    });
  }

  it('falls back to GCS when DB has no firmware storage config', async () => {
    mockSettingsRows(null, null);
    const provider = await getFirmwareStorageProvider();
    expect(provider.supportsSignedDownload()).toBe(true);
    expect(mockCreateBaseStorageProvider).toHaveBeenCalled();
  });

  it('uses DB config and returns cached provider when config unchanged', async () => {
    mockSettingsRows('local', JSON.stringify({ basePath: './fw' }));
    mockCreateBaseStorageProvider.mockReturnValue(makeLocalBase());

    const first = await getFirmwareStorageProvider();
    const second = await getFirmwareStorageProvider();
    expect(first).toBe(second);
    expect(mockCreateBaseStorageProvider).toHaveBeenCalledTimes(1);
  });

  it('saveFirmwareStorageConfig upserts rows and invalidates caches', async () => {
    // existing type + existing config
    let firstCalls = 0;
    mockDb.mockImplementation(() => {
      const chain: {
        where: jest.Mock;
        first: jest.Mock;
        update: jest.Mock;
        insert: jest.Mock;
      } = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn(),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockResolvedValue(1),
      };
      chain.first.mockImplementation(async () => {
        firstCalls += 1;
        return { id: `row-${firstCalls}` };
      });
      return chain;
    });

    await saveFirmwareStorageConfig('gcs', { projectId: 'p', bucketName: 'b' });

    expect(mockClearProvisioningStorageCache).toHaveBeenCalled();
    // after save, sync getter should rebuild
    const provider = getFirmwareStorageProviderSync();
    expect(provider).toBeDefined();
  });

  it('saveFirmwareStorageConfig inserts when settings rows are missing', async () => {
    const insert = jest.fn().mockResolvedValue(1);
    mockDb.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      insert,
      fn: { now: jest.fn(() => 'NOW()') },
      raw: jest.fn((sql: string) => sql),
    }));
    // saveFirmwareStorageConfig uses DatabaseService connection for where/insert —
    // also needs fn/raw on connection itself
    Object.assign(mockDb, {
      fn: { now: jest.fn(() => 'NOW()') },
      raw: jest.fn((sql: string) => sql),
    });

    await saveFirmwareStorageConfig('local', { basePath: './x' });
    expect(insert).toHaveBeenCalled();
  });
});
