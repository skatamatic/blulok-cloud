/**
 * GDrive Storage Provider (BluDesign Domain Layer) Tests
 *
 * Tests that the domain adapter delegates to GDriveBaseStorage
 * with correct path conventions and applies validation rules.
 * Low-level Drive API behavior is tested in gdrive-base.provider.test.ts.
 */

import { StorageError, StorageErrorCode } from '@/services/storage/base-storage.interface';

// Mock the base provider
const mockBase = {
  type: 'gdrive',
  initialize: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue(true),
  uploadFile: jest.fn().mockResolvedValue('path'),
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('content')),
  deleteFile: jest.fn().mockResolvedValue(undefined),
  fileExists: jest.fn().mockResolvedValue(true),
  listFiles: jest.fn().mockResolvedValue(['file1.glb', 'file2.png']),
  deleteDirectory: jest.fn().mockResolvedValue(undefined),
  getDirectorySize: jest.fn().mockResolvedValue(1024),
};

jest.mock('@/services/storage/gdrive-base.provider', () => ({
  GDriveBaseStorage: jest.fn((config: any) => {
    // Replicate the base constructor validation so domain-layer tests can verify it propagates
    if (!config.clientId) throw new StorageError('Google Drive client ID is required', StorageErrorCode.CONFIGURATION_ERROR);
    if (!config.clientSecret) throw new StorageError('Google Drive client secret is required', StorageErrorCode.CONFIGURATION_ERROR);
    if (!config.rootFolderId) throw new StorageError('Google Drive root folder ID is required', StorageErrorCode.CONFIGURATION_ERROR);
    return mockBase;
  }),
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { GDriveStorageProvider } from '@/bludesign/services/storage/gdrive.provider';

describe('GDriveStorageProvider (BluDesign Domain Layer)', () => {
  let provider: GDriveStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GDriveStorageProvider({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      rootFolderId: 'root-folder-id',
      refreshToken: 'refresh-token',
      accessToken: 'access-token',
    });
  });

  describe('Constructor', () => {
    it('should throw if client ID is missing', () => {
      expect(() => new GDriveStorageProvider({
        clientSecret: 'secret',
        rootFolderId: 'root',
      } as any)).toThrow(StorageError);
    });

    it('should throw if client secret is missing', () => {
      expect(() => new GDriveStorageProvider({
        clientId: 'id',
        rootFolderId: 'root',
      } as any)).toThrow(StorageError);
    });

    it('should throw if root folder ID is missing', () => {
      expect(() => new GDriveStorageProvider({
        clientId: 'id',
        clientSecret: 'secret',
      } as any)).toThrow(StorageError);
    });
  });

  describe('Lifecycle', () => {
    it('should delegate initialize to base', async () => {
      await provider.initialize();
      expect(mockBase.initialize).toHaveBeenCalled();
    });

    it('should delegate healthCheck to base', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
      expect(mockBase.healthCheck).toHaveBeenCalled();
    });
  });

  describe('Asset Operations', () => {
    it('should upload asset file with correct path', async () => {
      await provider.uploadAssetFile('proj-1', 'asset-1', 'model.glb', Buffer.from('data'), 'model/gltf-binary');
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'projects/proj-1/assets/asset-1/model.glb',
        expect.any(Buffer),
        'model/gltf-binary',
      );
    });

    it('should download asset file with correct path', async () => {
      await provider.downloadAssetFile('proj-1', 'asset-1', 'model.glb');
      expect(mockBase.downloadFile).toHaveBeenCalledWith(
        'projects/proj-1/assets/asset-1/model.glb',
      );
    });

    it('should delete asset files with correct path', async () => {
      await provider.deleteAssetFiles('proj-1', 'asset-1');
      expect(mockBase.deleteDirectory).toHaveBeenCalledWith(
        'projects/proj-1/assets/asset-1',
      );
    });

    it('should list asset files with correct path', async () => {
      const files = await provider.listAssetFiles('proj-1', 'asset-1');
      expect(mockBase.listFiles).toHaveBeenCalledWith('projects/proj-1/assets/asset-1');
      expect(files).toEqual(['file1.glb', 'file2.png']);
    });
  });

  describe('Global Asset Operations', () => {
    it('should upload global asset with correct path', async () => {
      await provider.uploadGlobalAsset('model-1', 'model.glb', Buffer.from('data'), 'model/gltf-binary');
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'global/models/model-1/model.glb',
        expect.any(Buffer),
        'model/gltf-binary',
      );
    });

    it('should delete global asset with correct path', async () => {
      await provider.deleteGlobalAsset('model-1');
      expect(mockBase.deleteDirectory).toHaveBeenCalledWith('global/models/model-1');
    });
  });

  describe('Texture Operations', () => {
    it('should upload texture with correct path', async () => {
      await provider.uploadTexture('proj-1', 'asset-1', 'diffuse.png', Buffer.from('data'), 'image/png');
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'projects/proj-1/assets/asset-1/textures/diffuse.png',
        expect.any(Buffer),
        'image/png',
      );
    });

    it('should delete texture with correct path', async () => {
      await provider.deleteTexture('proj-1', 'asset-1', 'diffuse.png');
      expect(mockBase.deleteFile).toHaveBeenCalledWith(
        'projects/proj-1/assets/asset-1/textures/diffuse.png',
      );
    });
  });

  describe('Facility Operations', () => {
    it('should save facility manifest with correct path', async () => {
      const manifest = { id: 'fac-1', name: 'Test', assetManifest: [] } as any;
      await provider.saveFacilityManifest('proj-1', 'fac-1', manifest);
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'projects/proj-1/facilities/fac-1/manifest.json',
        expect.any(Buffer),
        'application/json',
      );
    });

    it('should load facility manifest with correct path', async () => {
      mockBase.downloadFile.mockResolvedValueOnce(
        Buffer.from(JSON.stringify({ id: 'fac-1', name: 'Test', assetManifest: [] })),
      );
      const manifest = await provider.loadFacilityManifest('proj-1', 'fac-1');
      expect(mockBase.downloadFile).toHaveBeenCalledWith(
        'projects/proj-1/facilities/fac-1/manifest.json',
      );
      expect(manifest.id).toBe('fac-1');
    });

    it('should delete facility with correct path', async () => {
      await provider.deleteFacility('proj-1', 'fac-1');
      expect(mockBase.deleteDirectory).toHaveBeenCalledWith(
        'projects/proj-1/facilities/fac-1',
      );
    });
  });

  describe('Project Operations', () => {
    it('should initialize project', async () => {
      await provider.initializeProject('proj-1');
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'projects/proj-1/project.json',
        expect.any(Buffer),
        'application/json',
      );
    });

    it('should delete project with correct path', async () => {
      await provider.deleteProject('proj-1');
      expect(mockBase.deleteDirectory).toHaveBeenCalledWith('projects/proj-1');
    });

    it('should get project storage usage', async () => {
      const size = await provider.getProjectStorageUsage('proj-1');
      expect(mockBase.getDirectorySize).toHaveBeenCalledWith('projects/proj-1');
      expect(size).toBe(1024);
    });
  });

  describe('File Validation', () => {
    it('should reject upload with disallowed extension', async () => {
      await expect(
        provider.uploadAssetFile('proj-1', 'asset-1', 'virus.exe', Buffer.from('data'), 'application/octet-stream'),
      ).rejects.toThrow(StorageError);
    });

    it('should reject upload exceeding max file size', async () => {
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101 MB
      await expect(
        provider.uploadAssetFile('proj-1', 'asset-1', 'model.glb', largeBuffer, 'model/gltf-binary'),
      ).rejects.toThrow(StorageError);
    });

    it('should accept upload with allowed extension and reasonable size', async () => {
      await provider.uploadAssetFile('proj-1', 'asset-1', 'model.glb', Buffer.from('ok'), 'model/gltf-binary');
      expect(mockBase.uploadFile).toHaveBeenCalled();
    });

    it('should validate texture extensions', async () => {
      await expect(
        provider.uploadTexture('proj-1', 'asset-1', 'readme.txt', Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow(StorageError);
    });

    it('should validate global asset extensions', async () => {
      await expect(
        provider.uploadGlobalAsset('model-1', 'script.sh', Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow(StorageError);
    });
  });

  describe('URL Generation', () => {
    it('should check file exists before generating URL', async () => {
      mockBase.fileExists.mockResolvedValueOnce(false);
      await expect(
        provider.getSignedUrl('proj-1', 'assets/a1/model.glb', 3600),
      ).rejects.toThrow(StorageError);
    });

    it('should return null for getPublicUrl', () => {
      expect(provider.getPublicUrl('proj-1', 'file.glb')).toBeNull();
    });
  });
});
