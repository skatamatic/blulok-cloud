/**
 * Google Drive Storage Provider Tests
 */

import { GDriveStorageProvider } from '@/bludesign/services/storage/gdrive.provider';
import { StorageError, StorageErrorCode } from '@/bludesign/services/storage/storage-provider.interface';
import { google } from 'googleapis';

// Mock googleapis
jest.mock('googleapis', () => {
  const mockDrive = {
    files: {
      get: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    permissions: {
      create: jest.fn(),
    },
  };

  // Create mutable credentials object
  const credentials = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
  };

  const mockOAuth2Client = {
    setCredentials: jest.fn().mockImplementation((creds) => {
      Object.assign(credentials, creds);
    }),
    refreshAccessToken: jest.fn(),
    generateAuthUrl: jest.fn(),
    getToken: jest.fn(),
    get credentials() {
      return credentials;
    },
  };

  return {
    google: {
      auth: {
        OAuth2: jest.fn(() => mockOAuth2Client),
      },
      drive: jest.fn(() => mockDrive),
    },
    __mockDrive: mockDrive,
    __mockOAuth2Client: mockOAuth2Client,
  };
});

describe('GDriveStorageProvider', () => {
  let provider: GDriveStorageProvider;
  let mockDrive: any;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const googleModule = require('googleapis');
    mockDrive = googleModule.__mockDrive;
    mockOAuth2Client = googleModule.__mockOAuth2Client;
    
    // Default mock responses
    mockDrive.files.get.mockResolvedValue({
      data: {
        id: 'file-id',
        name: 'test-file',
        mimeType: 'application/vnd.google-apps.folder',
      },
    });
    
    mockDrive.files.list.mockResolvedValue({
      data: { files: [] },
    });
    
    mockDrive.files.create.mockResolvedValue({
      data: {
        id: 'new-file-id',
        name: 'new-file',
        mimeType: 'application/octet-stream',
        size: '1024',
      },
    });
    
    mockDrive.files.delete.mockResolvedValue({});
    
    mockOAuth2Client.refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'new-access-token',
        refresh_token: 'refresh-token',
      },
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid config', async () => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });

      await provider.initialize();
      expect(mockDrive.files.get).toHaveBeenCalledWith({
        fileId: 'root-folder-id',
        fields: 'id,name,mimeType',
      });
    });

    it('should throw error if client ID is missing', () => {
      expect(() => {
        new GDriveStorageProvider({
          clientSecret: 'test-secret',
          rootFolderId: 'root-id',
        } as any);
      }).toThrow(StorageError);
    });

    it('should throw error if client secret is missing', () => {
      expect(() => {
        new GDriveStorageProvider({
          clientId: 'test-id',
          rootFolderId: 'root-id',
        } as any);
      }).toThrow(StorageError);
    });

    it('should throw error if root folder ID is missing', () => {
      expect(() => {
        new GDriveStorageProvider({
          clientId: 'test-id',
          clientSecret: 'test-secret',
        } as any);
      }).toThrow(StorageError);
    });

    it('should throw error if root folder does not exist', async () => {
      mockDrive.files.get.mockRejectedValue({ code: 404 });
      
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'invalid-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });

      await expect(provider.initialize()).rejects.toThrow(StorageError);
    });
  });

  describe('Health Check', () => {
    it('should return true if root folder is accessible', async () => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false if root folder is not accessible', async () => {
      mockDrive.files.get.mockRejectedValue({ code: 403 });
      
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });

      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Token Management', () => {
    it('should refresh access token when expired', async () => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });

      // Simulate expired token
      mockDrive.files.get.mockRejectedValueOnce({ code: 401 });
      mockDrive.files.get.mockResolvedValueOnce({
        data: {
          id: 'root-folder-id',
          name: 'Root',
          mimeType: 'application/vnd.google-apps.folder',
        },
      });

      await provider.initialize();
      
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
    });

    it('should throw error if refresh token is missing', async () => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
      });

      mockDrive.files.get.mockRejectedValue({ code: 401 });

      await expect(provider.initialize()).rejects.toThrow(StorageError);
    });
  });

  describe('Asset Operations', () => {
    beforeEach(() => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
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

      expect(result).toBe('new-file-id');
      expect(mockDrive.files.create).toHaveBeenCalled();
    });

    it('should download asset file', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: 'file-id', name: 'model.glb' }],
        },
      });
      
      mockDrive.files.get.mockResolvedValue({
        data: Buffer.from('test content'),
      });

      const buffer = await provider.downloadAssetFile('project-1', 'asset-1', 'model.glb');
      
      expect(buffer).toBeDefined();
    });

    it('should throw error if file not found on download', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [] },
      });

      await expect(
        provider.downloadAssetFile('project-1', 'asset-1', 'model.glb')
      ).rejects.toThrow(StorageError);
    });

    it('should delete asset files', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: 'file-id', name: 'model.glb' }],
        },
      });
      
      await provider.deleteAssetFiles('project-1', 'asset-1');
      
      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'file-id' });
    });

    it('should list asset files', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [
            { id: 'file-1', name: 'model.glb' },
            { id: 'file-2', name: 'texture.png' },
          ],
        },
      });

      const files = await provider.listAssetFiles('project-1', 'asset-1');
      
      expect(files).toEqual(['model.glb', 'texture.png']);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
      });
    });

    it('should retry on rate limit error', async () => {
      // Mock all the folder resolution calls first (getProjectFolder, getAssetFolder)
      // These happen before the actual listFiles call
      mockDrive.files.list
        // Folder resolution calls (projects, project-1, assets, asset-1)
        .mockResolvedValueOnce({ data: { files: [] } }) // projects folder check
        .mockResolvedValueOnce({ data: { files: [] } }) // project-1 folder check
        .mockResolvedValueOnce({ data: { files: [] } }) // assets folder check
        .mockResolvedValueOnce({ data: { files: [] } }) // asset-1 folder check
        // Now the actual listFiles call that should retry on rate limit
        .mockRejectedValueOnce({ code: 429 }) // First attempt fails with rate limit
        .mockResolvedValueOnce({ // Retry succeeds
          data: { files: [] },
        });

      const files = await provider.listAssetFiles('project-1', 'asset-1');
      
      expect(files).toEqual([]);
      // Should be called 6 times: 4 for folder resolution + 2 for the retry
      expect(mockDrive.files.list).toHaveBeenCalledTimes(6);
    });
  });

  describe('Facility Operations', () => {
    beforeEach(() => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });
    });

    it('should save facility manifest', async () => {
      const manifest = {
        id: 'facility-1',
        name: 'Test Facility',
        assetManifest: [],
      } as any;

      await provider.saveFacilityManifest('project-1', 'facility-1', manifest);
      
      expect(mockDrive.files.create).toHaveBeenCalled();
    });

    it('should load facility manifest', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: 'manifest-id', name: 'manifest.json' }],
        },
      });
      
      const manifestJson = JSON.stringify({
        id: 'facility-1',
        name: 'Test Facility',
        assetManifest: [],
      });
      
      mockDrive.files.get.mockResolvedValue({
        data: Buffer.from(manifestJson),
      });

      const manifest = await provider.loadFacilityManifest('project-1', 'facility-1');
      
      expect(manifest.id).toBe('facility-1');
    });
  });

  describe('Project Operations', () => {
    beforeEach(() => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });
    });

    it('should initialize project', async () => {
      await provider.initializeProject('project-1');
      
      expect(mockDrive.files.create).toHaveBeenCalled();
    });

    it('should delete project', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [
            { id: 'file-1', name: 'file1', mimeType: 'text/plain' },
            { id: 'folder-1', name: 'folder1', mimeType: 'application/vnd.google-apps.folder' },
          ],
        },
      });
      
      // Mock nested folder listing
      mockDrive.files.list
        .mockResolvedValueOnce({
          data: {
            files: [
              { id: 'file-1', name: 'file1', mimeType: 'text/plain' },
              { id: 'folder-1', name: 'folder1', mimeType: 'application/vnd.google-apps.folder' },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: { files: [] },
        });

      await provider.deleteProject('project-1');
      
      expect(mockDrive.files.delete).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new GDriveStorageProvider({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        rootFolderId: 'root-folder-id',
        refreshToken: 'refresh-token',
        accessToken: 'test-access-token', // Provide accessToken so credentials are set
      });
    });

    it('should handle permission denied errors', async () => {
      mockDrive.files.get.mockRejectedValue({ code: 403 });

      await expect(provider.initialize()).rejects.toThrow();
    });

    it('should handle folder not found errors', async () => {
      mockDrive.files.get.mockRejectedValue({ code: 404 });

      await expect(provider.initialize()).rejects.toThrow(StorageError);
    });
  });
});
