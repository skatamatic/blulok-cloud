/**
 * GCS Storage Provider Tests
 */

import { GCSStorageProvider } from '@/bludesign/services/storage/gcs.provider';
import { StorageError, StorageErrorCode } from '@/bludesign/services/storage/storage-provider.interface';
import { Storage } from '@google-cloud/storage';

// Mock @google-cloud/storage
jest.mock('@google-cloud/storage', () => {
  const mockBucket = {
    exists: jest.fn(),
    file: jest.fn(),
    getFiles: jest.fn(),
  };

  const mockFile = {
    exists: jest.fn(),
    save: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    getSignedUrl: jest.fn(),
    getMetadata: jest.fn(),
  };

  const mockStorage = jest.fn(() => ({
    bucket: jest.fn(() => mockBucket),
  }));

  return {
    Storage: mockStorage,
    __mockBucket: mockBucket,
    __mockFile: mockFile,
  };
});

describe('GCSStorageProvider', () => {
  let provider: GCSStorageProvider;
  let mockBucket: any;
  let mockFile: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get mocks
    const storageModule = require('@google-cloud/storage');
    mockBucket = storageModule.__mockBucket;
    mockFile = storageModule.__mockFile;
    
    mockBucket.file.mockReturnValue(mockFile);
    mockFile.exists.mockResolvedValue([true]);
    mockFile.save.mockResolvedValue(undefined);
    mockFile.download.mockResolvedValue([Buffer.from('test content')]);
    mockFile.delete.mockResolvedValue(undefined);
    mockFile.getSignedUrl.mockResolvedValue(['https://signed-url.example.com/file']);
    mockFile.getMetadata.mockResolvedValue([{ size: '1024' }]);
    mockBucket.exists.mockResolvedValue([true]);
    mockBucket.getFiles.mockResolvedValue([[]]);
  });

  describe('Initialization', () => {
    it('should initialize with valid config', async () => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });

      await provider.initialize();
      expect(mockBucket.exists).toHaveBeenCalled();
    });

    it('should throw error if bucket name is missing', () => {
      expect(() => {
        new GCSStorageProvider({
          projectId: 'test-project',
        } as any);
      }).toThrow(StorageError);
    });

    it('should throw error if project ID is missing', () => {
      expect(() => {
        new GCSStorageProvider({
          bucketName: 'test-bucket',
        } as any);
      }).toThrow(StorageError);
    });

    it('should throw error if bucket does not exist', async () => {
      mockBucket.exists.mockResolvedValue([false]);
      
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });

      await expect(provider.initialize()).rejects.toThrow(StorageError);
    });

    it('should support key file path', () => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
        keyFilePath: '/path/to/key.json',
      });

      expect(provider).toBeDefined();
    });

    it('should support key file contents', () => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
        keyFileContents: JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
        }),
      });

      expect(provider).toBeDefined();
    });

    it('should throw error for invalid key file contents', () => {
      expect(() => {
        new GCSStorageProvider({
          bucketName: 'test-bucket',
          projectId: 'test-project',
          keyFileContents: 'invalid json',
        });
      }).toThrow(StorageError);
    });
  });

  describe('Health Check', () => {
    it('should return true if bucket is accessible', async () => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(true);
      expect(mockBucket.exists).toHaveBeenCalled();
      expect(mockFile.save).toHaveBeenCalled();
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should return false if bucket does not exist', async () => {
      mockBucket.exists.mockResolvedValue([false]);
      
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Asset Operations', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should upload asset file', async () => {
      const data = Buffer.from('test content');
      const result = await provider.uploadAssetFile(
        'project-1',
        'asset-1',
        'model.glb',
        data,
        'model/gltf-binary'
      );

      expect(result).toBe('projects/project-1/assets/asset-1/model.glb');
      expect(mockFile.save).toHaveBeenCalledWith(data, expect.objectContaining({
        metadata: expect.objectContaining({
          contentType: 'model/gltf-binary',
        }),
      }));
    });

    it('should download asset file', async () => {
      const buffer = await provider.downloadAssetFile('project-1', 'asset-1', 'model.glb');
      
      expect(buffer).toEqual(Buffer.from('test content'));
      expect(mockFile.exists).toHaveBeenCalled();
      expect(mockFile.download).toHaveBeenCalled();
    });

    it('should throw error if file not found on download', async () => {
      mockFile.exists.mockResolvedValue([false]);

      await expect(
        provider.downloadAssetFile('project-1', 'asset-1', 'model.glb')
      ).rejects.toThrow(StorageError);
    });

    it('should delete asset files', async () => {
      mockBucket.getFiles.mockResolvedValue([[mockFile]]);
      
      await provider.deleteAssetFiles('project-1', 'asset-1');
      
      expect(mockBucket.getFiles).toHaveBeenCalledWith({
        prefix: 'projects/project-1/assets/asset-1/',
      });
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should list asset files', async () => {
      const mockFiles = [
        { name: 'projects/project-1/assets/asset-1/model.glb' },
        { name: 'projects/project-1/assets/asset-1/texture.png' },
      ];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const files = await provider.listAssetFiles('project-1', 'asset-1');
      
      expect(files).toEqual(['model.glb', 'texture.png']);
    });
  });

  describe('Global Asset Operations', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should upload global asset', async () => {
      const data = Buffer.from('test content');
      const result = await provider.uploadGlobalAsset(
        'model-1',
        'model.glb',
        data,
        'model/gltf-binary'
      );

      expect(result).toBe('global/models/model-1/model.glb');
    });

    it('should download global asset', async () => {
      const buffer = await provider.downloadGlobalAsset('model-1', 'model.glb');
      expect(buffer).toEqual(Buffer.from('test content'));
    });

    it('should delete global asset', async () => {
      mockBucket.getFiles.mockResolvedValue([[mockFile]]);
      
      await provider.deleteGlobalAsset('model-1');
      
      expect(mockBucket.getFiles).toHaveBeenCalledWith({
        prefix: 'global/models/model-1/',
      });
    });

    it('should list global asset files', async () => {
      const mockFiles = [
        { name: 'global/models/model-1/model.glb' },
      ];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const files = await provider.listGlobalAssetFiles('model-1');
      expect(files).toEqual(['model.glb']);
    });
  });

  describe('Texture Operations', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should upload texture', async () => {
      const data = Buffer.from('texture data');
      const result = await provider.uploadTexture(
        'project-1',
        'asset-1',
        'diffuse.png',
        data,
        'image/png'
      );

      expect(result).toBe('projects/project-1/assets/asset-1/textures/diffuse.png');
    });

    it('should download texture', async () => {
      const buffer = await provider.downloadTexture('project-1', 'asset-1', 'diffuse.png');
      expect(buffer).toEqual(Buffer.from('test content'));
    });

    it('should delete texture', async () => {
      await provider.deleteTexture('project-1', 'asset-1', 'diffuse.png');
      expect(mockFile.delete).toHaveBeenCalled();
    });
  });

  describe('Facility Operations', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should save facility manifest', async () => {
      const manifest = {
        id: 'facility-1',
        name: 'Test Facility',
        assetManifest: [],
      } as any;

      await provider.saveFacilityManifest('project-1', 'facility-1', manifest);
      
      expect(mockFile.save).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/json',
          }),
        })
      );
      // Verify the buffer contains the manifest JSON
      const savedBuffer = mockFile.save.mock.calls[0][0];
      expect(savedBuffer.toString()).toContain('"id": "facility-1"');
    });

    it('should load facility manifest', async () => {
      const manifestJson = JSON.stringify({
        id: 'facility-1',
        name: 'Test Facility',
        assetManifest: [],
      });
      mockFile.download.mockResolvedValue([Buffer.from(manifestJson)]);

      const manifest = await provider.loadFacilityManifest('project-1', 'facility-1');
      
      expect(manifest.id).toBe('facility-1');
      expect(manifest.name).toBe('Test Facility');
    });

    it('should delete facility', async () => {
      mockBucket.getFiles.mockResolvedValue([[mockFile]]);
      
      await provider.deleteFacility('project-1', 'facility-1');
      
      expect(mockBucket.getFiles).toHaveBeenCalledWith({
        prefix: 'projects/project-1/facilities/facility-1/',
      });
    });

    it('should list facilities', async () => {
      const mockFiles = [
        { name: 'projects/project-1/facilities/facility-1/manifest.json' },
        { name: 'projects/project-1/facilities/facility-2/manifest.json' },
      ];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const facilities = await provider.listFacilities('project-1');
      
      expect(facilities).toContain('facility-1');
      expect(facilities).toContain('facility-2');
    });
  });

  describe('Project Operations', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should initialize project', async () => {
      await provider.initializeProject('project-1');
      
      expect(mockFile.save).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/json',
          }),
        })
      );
      // Verify the buffer contains the metadata JSON
      const savedBuffer = mockFile.save.mock.calls[0][0];
      expect(savedBuffer.toString()).toContain('"projectId": "project-1"');
    });

    it('should delete project', async () => {
      mockBucket.getFiles.mockResolvedValue([[mockFile]]);
      
      await provider.deleteProject('project-1');
      
      expect(mockBucket.getFiles).toHaveBeenCalledWith({
        prefix: 'projects/project-1/',
      });
    });

    it('should calculate project storage usage', async () => {
      const mockFile1 = {
        name: 'projects/project-1/file1.glb',
        getMetadata: jest.fn().mockResolvedValue([{ size: '1024' }]),
      };
      const mockFile2 = {
        name: 'projects/project-1/file2.png',
        getMetadata: jest.fn().mockResolvedValue([{ size: '2048' }]),
      };
      const mockFiles = [mockFile1, mockFile2];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const usage = await provider.getProjectStorageUsage('project-1');
      
      expect(usage).toBeGreaterThan(0);
      expect(mockFile1.getMetadata).toHaveBeenCalled();
      expect(mockFile2.getMetadata).toHaveBeenCalled();
    });
  });

  describe('URL Generation', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should generate signed URL', async () => {
      const url = await provider.getSignedUrl('project-1', 'file.glb', 3600);
      
      expect(url).toBe('https://signed-url.example.com/file');
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read',
        })
      );
    });

    it('should return public URL for public bucket', () => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
        publicBucket: true,
      });

      const url = provider.getPublicUrl('project-1', 'file.glb');
      
      expect(url).toContain('storage.googleapis.com');
      expect(url).toContain('test-bucket');
    });

    it('should return null for public URL on private bucket', () => {
      const url = provider.getPublicUrl('project-1', 'file.glb');
      expect(url).toBeNull();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new GCSStorageProvider({
        bucketName: 'test-bucket',
        projectId: 'test-project',
      });
    });

    it('should handle network errors', async () => {
      mockFile.download.mockRejectedValue(new Error('Network error'));

      await expect(
        provider.downloadAssetFile('project-1', 'asset-1', 'model.glb')
      ).rejects.toThrow(StorageError);
    });

    it('should handle permission denied errors', async () => {
      const error: any = new Error('Permission denied');
      error.code = 403;
      mockBucket.exists.mockRejectedValue(error);

      await expect(provider.initialize()).rejects.toThrow();
    });
  });
});
