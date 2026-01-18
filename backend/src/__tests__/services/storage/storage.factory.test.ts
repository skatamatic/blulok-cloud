/**
 * Storage Factory Tests
 */

import {
  createStorageProvider,
  getDefaultStorageProvider,
  clearProviderCache,
  validateStorageConfig,
} from '@/bludesign/services/storage/storage.factory';
import { StorageProviderType } from '@/bludesign/types/bludesign.types';
import { StorageError } from '@/bludesign/services/storage/storage-provider.interface';

// Mock providers
jest.mock('@/bludesign/services/storage/local.provider');
jest.mock('@/bludesign/services/storage/gcs.provider');
jest.mock('@/bludesign/services/storage/gdrive.provider');

describe('Storage Factory', () => {
  beforeEach(() => {
    clearProviderCache();
    jest.clearAllMocks();
  });

  describe('createStorageProvider', () => {
    it('should create local provider', () => {
      const provider = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: {
          basePath: './storage',
        },
      });

      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.LOCAL);
    });

    it('should create GCS provider', () => {
      const provider = createStorageProvider({
        type: StorageProviderType.GCS,
        config: {
          bucketName: 'test-bucket',
          projectId: 'test-project',
        },
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
        createStorageProvider({
          type: 'unknown' as any,
          config: {},
        });
      }).toThrow(StorageError);
    });

    it('should cache provider instances', () => {
      const config = {
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage' },
      };

      const provider1 = createStorageProvider(config);
      const provider2 = createStorageProvider(config);

      expect(provider1).toBe(provider2);
    });

    it('should create new instance for different configs', () => {
      const provider1 = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage1' },
      });

      const provider2 = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage2' },
      });

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('getDefaultStorageProvider', () => {
    it('should return local provider with default config', () => {
      const provider = getDefaultStorageProvider();

      expect(provider).toBeDefined();
      expect(provider.type).toBe(StorageProviderType.LOCAL);
    });
  });

  describe('clearProviderCache', () => {
    it('should clear provider cache', () => {
      const config = {
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage' },
      };

      const provider1 = createStorageProvider(config);
      clearProviderCache();
      const provider2 = createStorageProvider(config);

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('validateStorageConfig', () => {
    it('should validate local storage config', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.LOCAL,
        config: { basePath: './storage' },
      });

      expect(errors).toHaveLength(0);
    });

    it('should return error for local storage without basePath', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.LOCAL,
        config: {},
      });

      expect(errors).toContain('Local storage requires basePath');
    });

    it('should validate GCS config', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GCS,
        config: {
          bucketName: 'test-bucket',
          projectId: 'test-project',
        },
      });

      expect(errors).toHaveLength(0);
    });

    it('should return error for GCS without bucketName', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GCS,
        config: { projectId: 'test-project' },
      });

      expect(errors).toContain('GCS storage requires bucketName');
    });

    it('should return error for GCS without projectId', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GCS,
        config: { bucketName: 'test-bucket' },
      });

      expect(errors).toContain('GCS storage requires projectId');
    });

    it('should validate Google Drive config', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          rootFolderId: 'root-folder-id',
        },
      });

      expect(errors).toHaveLength(0);
    });

    it('should return error for Google Drive without clientId', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {
          clientSecret: 'test-secret',
          rootFolderId: 'root-id',
        },
      });

      expect(errors).toContain('Google Drive storage requires clientId');
    });

    it('should return error for Google Drive without clientSecret', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'test-id',
          rootFolderId: 'root-id',
        },
      });

      expect(errors).toContain('Google Drive storage requires clientSecret');
    });

    it('should return error for Google Drive without rootFolderId', () => {
      const errors = validateStorageConfig({
        type: StorageProviderType.GDRIVE,
        config: {
          clientId: 'test-id',
          clientSecret: 'test-secret',
        },
      });

      expect(errors).toContain('Google Drive storage requires rootFolderId');
    });

    it('should return error for unknown provider type', () => {
      const errors = validateStorageConfig({
        type: 'unknown' as any,
        config: {},
      });

      expect(errors).toContain('Unknown storage provider type: unknown');
    });
  });
});
