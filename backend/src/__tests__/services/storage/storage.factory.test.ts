/**
 * BluDesign Storage Factory Tests
 *
 * Tests the domain-layer factory that wraps base providers
 * in domain adapters.
 */

import {
  createStorageProvider,
  getDefaultStorageProvider,
  clearProviderCache,
  validateStorageConfig,
} from '@/bludesign/services/storage/storage.factory';
import { StorageProviderType } from '@/bludesign/types/bludesign.types';
import { StorageError } from '@/bludesign/services/storage/storage-provider.interface';

// Mock domain-layer providers (which internally create base providers)
jest.mock('@/bludesign/services/storage/local.provider', () => ({
  LocalStorageProvider: jest.fn().mockImplementation(() => ({
    type: 'local',
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('@/bludesign/services/storage/gcs.provider', () => ({
  GCSStorageProvider: jest.fn().mockImplementation(() => ({
    type: 'gcs',
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('@/bludesign/services/storage/gdrive.provider', () => ({
  GDriveStorageProvider: jest.fn().mockImplementation(() => ({
    type: 'gdrive',
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
}));

describe('BluDesign Storage Factory', () => {
  beforeEach(() => {
    clearProviderCache();
    jest.clearAllMocks();
  });

  describe('createStorageProvider', () => {
    it('should create local provider', () => {
      const provider = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage' },
      });
      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.LOCAL);
    });

    it('should create GCS provider', () => {
      const provider = createStorageProvider({
        type: StorageProviderType.GCS,
        config: { bucketName: 'test-bucket', projectId: 'test-project' },
      });
      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.GCS);
    });

    it('should create Google Drive provider', () => {
      const provider = createStorageProvider({
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          rootFolderId: 'root-folder-id',
          refreshToken: 'refresh-token',
        },
      });
      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.GDRIVE);
    });

    it('should throw error for unknown provider type', () => {
      expect(() => {
        createStorageProvider({ type: 'unknown' as any, config: {} });
      }).toThrow(StorageError);
    });

    it('should cache provider instances', () => {
      const config = { type: StorageProviderType.LOCAL, config: { basePath: './storage' } };
      const p1 = createStorageProvider(config);
      const p2 = createStorageProvider(config);
      expect(p1).toBe(p2);
    });

    it('should create new instance for different configs', () => {
      const p1 = createStorageProvider({ type: StorageProviderType.LOCAL, config: { basePath: './s1' } });
      const p2 = createStorageProvider({ type: StorageProviderType.LOCAL, config: { basePath: './s2' } });
      expect(p1).not.toBe(p2);
    });

    it('should use stable cache key (no secrets in key)', () => {
      // Two GDrive configs differing only in accessToken should return same cached instance
      const base = {
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'c1',
          clientSecret: 'secret',
          rootFolderId: 'root',
          refreshToken: 'rt',
        },
      };
      const p1 = createStorageProvider(base);
      const p2 = createStorageProvider({
        ...base,
        config: { ...base.config, accessToken: 'new-token' },
      });
      // Cache key is bd:gdrive:c1:root — no token in key
      expect(p1).toBe(p2);
    });
  });

  describe('getDefaultStorageProvider', () => {
    it('should return GCS provider with default config', () => {
      const provider = getDefaultStorageProvider();
      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.GCS);
    });
  });

  describe('clearProviderCache', () => {
    it('should clear provider cache', () => {
      const config = { type: StorageProviderType.LOCAL, config: { basePath: './storage' } };
      const p1 = createStorageProvider(config);
      clearProviderCache();
      const p2 = createStorageProvider(config);
      expect(p1).not.toBe(p2);
    });
  });

  describe('validateStorageConfig', () => {
    it('should validate local storage config', () => {
      expect(validateStorageConfig({ type: StorageProviderType.LOCAL, config: { basePath: './s' } })).toHaveLength(0);
    });

    it('should return error for local storage without basePath', () => {
      expect(validateStorageConfig({ type: StorageProviderType.LOCAL, config: {} })).toContain('Local storage requires basePath');
    });

    it('should validate GCS config', () => {
      expect(validateStorageConfig({ type: StorageProviderType.GCS, config: { bucketName: 'b', projectId: 'p' } })).toHaveLength(0);
    });

    it('should return error for GCS without bucketName', () => {
      expect(validateStorageConfig({ type: StorageProviderType.GCS, config: { projectId: 'p' } })).toContain('GCS storage requires bucketName');
    });

    it('should return error for GCS without projectId', () => {
      expect(validateStorageConfig({ type: StorageProviderType.GCS, config: { bucketName: 'b' } })).toContain('GCS storage requires projectId');
    });

    it('should validate Google Drive config', () => {
      expect(validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: { clientId: 'c', clientSecret: 's', rootFolderId: 'r' },
      })).toHaveLength(0);
    });

    it('should return error for Google Drive without clientId', () => {
      expect(validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: { clientSecret: 's', rootFolderId: 'r' },
      })).toContain('Google Drive storage requires clientId');
    });

    it('should return error for Google Drive without clientSecret', () => {
      expect(validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: { clientId: 'c', rootFolderId: 'r' },
      })).toContain('Google Drive storage requires clientSecret');
    });

    it('should return error for Google Drive without rootFolderId', () => {
      expect(validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: { clientId: 'c', clientSecret: 's' },
      })).toContain('Google Drive storage requires rootFolderId');
    });

    it('should return error for unknown provider type', () => {
      expect(validateStorageConfig({ type: 'unknown' as any, config: {} })).toContain('Unknown storage provider type: unknown');
    });
  });
});
