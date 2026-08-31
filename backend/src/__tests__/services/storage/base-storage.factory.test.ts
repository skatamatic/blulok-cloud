/**
 * Base Storage Factory Unit Tests
 *
 * Tests createBaseStorageProvider, validateBaseStorageConfig, and clearBaseProviderCache.
 * Provider constructors are mocked to avoid creating real storage instances.
 */

import {
  createBaseStorageProvider,
  validateBaseStorageConfig,
  clearBaseProviderCache,
} from '@/services/storage/base-storage.factory';
import {
  StorageProviderType,
  StorageError,
  StorageErrorCode,
} from '@/services/storage/base-storage.interface';

jest.mock('@/services/storage/local-base.provider', () => ({
  LocalBaseStorage: jest.fn().mockImplementation((config) => ({
    type: 'local',
    config,
    initialize: jest.fn(),
  })),
}));
jest.mock('@/services/storage/gcs-base.provider', () => ({
  GCSBaseStorage: jest.fn().mockImplementation((config) => ({
    type: 'gcs',
    config,
    initialize: jest.fn(),
  })),
}));
jest.mock('@/services/storage/gdrive-base.provider', () => ({
  GDriveBaseStorage: jest.fn().mockImplementation((config) => ({
    type: 'gdrive',
    config,
    initialize: jest.fn(),
  })),
}));

import { LocalBaseStorage } from '@/services/storage/local-base.provider';
import { GCSBaseStorage } from '@/services/storage/gcs-base.provider';
import { GDriveBaseStorage } from '@/services/storage/gdrive-base.provider';

describe('Base Storage Factory', () => {
  beforeEach(() => {
    clearBaseProviderCache();
    jest.clearAllMocks();
  });

  describe('createBaseStorageProvider', () => {
    it('creates LocalBaseStorage for type LOCAL with basePath config', () => {
      const config = {
        type: StorageProviderType.LOCAL,
        config: { basePath: '/tmp/storage' },
      };

      const provider = createBaseStorageProvider(config);

      expect(LocalBaseStorage).toHaveBeenCalledTimes(1);
      expect(LocalBaseStorage).toHaveBeenCalledWith({ basePath: '/tmp/storage' });
      expect(provider.type).toBe('local');
      expect((provider as unknown as { config: Record<string, unknown> }).config).toEqual({ basePath: '/tmp/storage' });
    });

    it('creates GCSBaseStorage for type GCS with bucketName+projectId config', () => {
      const config = {
        type: StorageProviderType.GCS,
        config: { bucketName: 'my-bucket', projectId: 'my-project' },
      };

      const provider = createBaseStorageProvider(config);

      expect(GCSBaseStorage).toHaveBeenCalledTimes(1);
      expect(GCSBaseStorage).toHaveBeenCalledWith({
        bucketName: 'my-bucket',
        projectId: 'my-project',
      });
      expect(provider.type).toBe('gcs');
      expect((provider as unknown as { config: Record<string, unknown> }).config).toEqual({
        bucketName: 'my-bucket',
        projectId: 'my-project',
      });
    });

    it('creates GDriveBaseStorage for type GDRIVE with clientId+clientSecret+rootFolderId config', () => {
      const config = {
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          rootFolderId: 'root-folder-id',
        },
      };

      const provider = createBaseStorageProvider(config);

      expect(GDriveBaseStorage).toHaveBeenCalledTimes(1);
      expect(GDriveBaseStorage).toHaveBeenCalledWith({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        rootFolderId: 'root-folder-id',
      });
      expect(provider.type).toBe('gdrive');
      expect((provider as unknown as { config: Record<string, unknown> }).config).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        rootFolderId: 'root-folder-id',
      });
    });

    it('throws CONFIGURATION_ERROR for unknown type', () => {
      const config = {
        type: 'unknown' as StorageProviderType,
        config: {},
      };

      expect(() => createBaseStorageProvider(config)).toThrow(StorageError);
      expect(() => createBaseStorageProvider(config)).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('returns cached instance on second call with same config', () => {
      const config = {
        type: StorageProviderType.LOCAL,
        config: { basePath: '/tmp/cached' },
      };

      const provider1 = createBaseStorageProvider(config);
      const provider2 = createBaseStorageProvider(config);

      expect(provider1).toBe(provider2);
      expect(LocalBaseStorage).toHaveBeenCalledTimes(1);
    });

    it('returns fresh instance after clearBaseProviderCache()', () => {
      const config = {
        type: StorageProviderType.LOCAL,
        config: { basePath: '/tmp/fresh' },
      };

      const provider1 = createBaseStorageProvider(config);
      clearBaseProviderCache();
      const provider2 = createBaseStorageProvider(config);

      expect(provider1).not.toBe(provider2);
      expect(LocalBaseStorage).toHaveBeenCalledTimes(2);
    });

    it('returns same cached instance when configs differ only by accessToken (BUG FIX #9: cache key excludes secrets)', () => {
      const baseConfig = {
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'same-client',
          clientSecret: 'same-secret',
          rootFolderId: 'same-root',
        },
      };

      const config1 = {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          accessToken: 'token-a',
        },
      };

      const config2 = {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          accessToken: 'token-b',
        },
      };

      const provider1 = createBaseStorageProvider(config1);
      const provider2 = createBaseStorageProvider(config2);

      expect(provider1).toBe(provider2);
      expect(GDriveBaseStorage).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateBaseStorageConfig', () => {
    it('returns [] for valid local config', () => {
      const result = validateBaseStorageConfig({
        type: StorageProviderType.LOCAL,
        config: { basePath: '/tmp/storage' },
      });
      expect(result).toEqual([]);
    });

    it('returns error for missing basePath', () => {
      const result = validateBaseStorageConfig({
        type: StorageProviderType.LOCAL,
        config: {},
      });
      expect(result).toEqual(['Local storage requires basePath']);
    });

    it('returns [] for valid GCS config', () => {
      const result = validateBaseStorageConfig({
        type: StorageProviderType.GCS,
        config: { bucketName: 'bucket', projectId: 'project' },
      });
      expect(result).toEqual([]);
    });

    it('returns errors for missing bucketName, projectId', () => {
      const result1 = validateBaseStorageConfig({
        type: StorageProviderType.GCS,
        config: { projectId: 'project' },
      });
      expect(result1).toContain('GCS storage requires bucketName');

      const result2 = validateBaseStorageConfig({
        type: StorageProviderType.GCS,
        config: { bucketName: 'bucket' },
      });
      expect(result2).toContain('GCS storage requires projectId');

      const result3 = validateBaseStorageConfig({
        type: StorageProviderType.GCS,
        config: {},
      });
      expect(result3).toContain('GCS storage requires bucketName');
      expect(result3).toContain('GCS storage requires projectId');
    });

    it('returns [] for valid GDrive config', () => {
      const result = validateBaseStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'cid',
          clientSecret: 'secret',
          rootFolderId: 'root',
        },
      });
      expect(result).toEqual([]);
    });

    it('returns errors for missing clientId, clientSecret, rootFolderId', () => {
      const result = validateBaseStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {},
      });
      expect(result).toContain('Google Drive storage requires clientId');
      expect(result).toContain('Google Drive storage requires clientSecret');
      expect(result).toContain('Google Drive storage requires rootFolderId');
    });

    it('returns error for unknown provider type', () => {
      const result = validateBaseStorageConfig({
        type: 'unknown' as StorageProviderType,
        config: {},
      });
      expect(result).toEqual(['Unknown storage provider type: unknown']);
    });
  });

  describe('clearBaseProviderCache', () => {
    it('clears cached instances', () => {
      const config = {
        type: StorageProviderType.GCS,
        config: { bucketName: 'b', projectId: 'p' },
      };

      const provider1 = createBaseStorageProvider(config);
      expect(provider1).toBeDefined();

      clearBaseProviderCache();

      const provider2 = createBaseStorageProvider(config);
      expect(provider1).not.toBe(provider2);
      expect(GCSBaseStorage).toHaveBeenCalledTimes(2);
    });
  });
});
