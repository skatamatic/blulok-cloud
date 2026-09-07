/**
 * GDriveBaseStorage Provider Unit Tests
 *
 * Tests GDriveBaseStorage with mocked googleapis (Google Drive v3 API).
 * Covers constructor validation, lifecycle, file operations, and bug fixes.
 */

import { GDriveBaseStorage } from '@/services/storage/gdrive-base.provider';
import {
  StorageError,
  StorageErrorCode,
} from '@/services/storage/base-storage.interface';

jest.mock('googleapis', () => {
  const mockDrive = {
    files: {
      get: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const credentials = { access_token: 'mock-access', refresh_token: 'mock-refresh' };
  const mockOAuth2Client = {
    setCredentials: jest.fn((creds: any) => Object.assign(credentials, creds)),
    refreshAccessToken: jest.fn(),
    get credentials() {
      return credentials;
    },
  };
  return {
    google: {
      auth: { OAuth2: jest.fn(() => mockOAuth2Client) },
      drive: jest.fn(() => mockDrive),
    },
    __mockDrive: mockDrive,
    __mockOAuth2Client: mockOAuth2Client,
  };
});

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('GDriveBaseStorage', () => {
  let storage: GDriveBaseStorage;
  let mockDrive: any;
  let mockOAuth2Client: any;

  const rootFolderId = 'root-folder-123';
  const baseConfig = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    rootFolderId,
    accessToken: 'mock-access',
    refreshToken: 'mock-refresh',
  };

  /**
   * Configures files.list for folder lookups and optional file/list results.
   * - files.get for rootFolderId returns folder metadata
   * - files.list with q matching folder name returns the folder
   * - files.list with q matching file name returns the file
   * - files.list for listing children returns listResults keyed by parentId
   */
  function setupListAndGetMocks(config: {
    rootFolderId: string;
    folderLookups?: Array<{ parentId: string; folderName: string; folderId: string }>;
    fileLookups?: Array<{ parentId: string; fileName: string; fileId: string; size?: string }>;
    listResults?: Record<string, Array<{ id: string; name: string; mimeType: string; size?: string }>>;
  }) {
    mockDrive.files.get.mockImplementation((params: any) => {
      if (params.fileId === config.rootFolderId) {
        return Promise.resolve({
          data: {
            id: config.rootFolderId,
            name: 'root',
            mimeType: 'application/vnd.google-apps.folder',
          },
        });
      }
      // For file content download (alt: 'media')
      if (params.alt === 'media') {
        return Promise.resolve({ data: new ArrayBuffer(8) });
      }
      return Promise.reject({ code: 404, message: 'Not found' });
    });

    mockDrive.files.list.mockImplementation((params: any) => {
      const q = params?.q || '';

      // Folder lookup: mimeType='application/vnd.google-apps.folder'
      if (q.includes("mimeType='application/vnd.google-apps.folder'") && config.folderLookups) {
        for (const f of config.folderLookups) {
          if (q.includes(`'${f.parentId}'`) && q.includes(`name='${f.folderName}'`)) {
            return Promise.resolve({
              data: {
                files: [{ id: f.folderId, name: f.folderName, mimeType: 'application/vnd.google-apps.folder' }],
              },
            });
          }
        }
        return Promise.resolve({ data: { files: [] } });
      }

      // File lookup: mimeType!='application/vnd.google-apps.folder'
      if (q.includes("mimeType!='application/vnd.google-apps.folder'") && config.fileLookups) {
        for (const f of config.fileLookups) {
          if (q.includes(`'${f.parentId}'`) && q.includes(`name='${f.fileName}'`)) {
            return Promise.resolve({
              data: {
                files: [{ id: f.fileId, name: f.fileName, mimeType: 'application/octet-stream', size: f.size || '0' }],
              },
            });
          }
        }
        return Promise.resolve({ data: { files: [] } });
      }

      // List all in parent (no name filter)
      if (config.listResults && !q.includes("name='")) {
        for (const [parentId, files] of Object.entries(config.listResults)) {
          if (q.includes(`'${parentId}'`)) {
            return Promise.resolve({ data: { files } });
          }
        }
      }

      return Promise.resolve({ data: { files: [] } });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    const googleapis = require('googleapis');
    mockDrive = googleapis.__mockDrive;
    mockOAuth2Client = googleapis.__mockOAuth2Client;

    // Reset mock credentials
    const creds = mockOAuth2Client.credentials;
    creds.access_token = 'mock-access';
    creds.refresh_token = 'mock-refresh';

    setupListAndGetMocks({
      rootFolderId,
      folderLookups: [],
      fileLookups: [],
      listResults: {},
    });

    mockDrive.files.create.mockResolvedValue({
      data: { id: 'new-file-id', name: 'file', mimeType: 'application/octet-stream', size: '0' },
    });
    mockDrive.files.update.mockResolvedValue({
      data: { id: 'updated-id', name: 'file', mimeType: 'application/octet-stream', size: '0' },
    });
    mockDrive.files.delete.mockResolvedValue(undefined);
  });

  describe('Constructor', () => {
    it('throws CONFIGURATION_ERROR without clientId', () => {
      expect(() => new GDriveBaseStorage({ ...baseConfig, clientId: '' })).toThrow(StorageError);
      expect(() => new GDriveBaseStorage({ ...baseConfig, clientId: '' })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR without clientSecret', () => {
      expect(() => new GDriveBaseStorage({ ...baseConfig, clientSecret: '' })).toThrow(StorageError);
      expect(() => new GDriveBaseStorage({ ...baseConfig, clientSecret: '' })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR without rootFolderId', () => {
      expect(() => new GDriveBaseStorage({ ...baseConfig, rootFolderId: '' })).toThrow(StorageError);
      expect(() => new GDriveBaseStorage({ ...baseConfig, rootFolderId: '' })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('BUG FIX #8: setCredentials is called in constructor with both access_token and refresh_token', () => {
      new GDriveBaseStorage({
        ...baseConfig,
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      });

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'access-123',
        refresh_token: 'refresh-456',
      });
    });
  });

  describe('initialize', () => {
    it('calls files.get on rootFolderId and succeeds when folder exists', async () => {
      storage = new GDriveBaseStorage(baseConfig);
      await expect(storage.initialize()).resolves.not.toThrow();
      expect(mockDrive.files.get).toHaveBeenCalledWith({
        fileId: rootFolderId,
        fields: 'id,name,mimeType',
      });
    });

    it('throws PERMISSION_DENIED when files.get fails', async () => {
      mockDrive.files.get.mockRejectedValue(new Error('Forbidden'));
      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.initialize()).rejects.toThrow(StorageError);
      await expect(storage.initialize()).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });
  });

  describe('healthCheck', () => {
    it('creates and deletes a test file, returns true on success', async () => {
      storage = new GDriveBaseStorage(baseConfig);
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'healthcheck-id', name: '.healthcheck', mimeType: 'text/plain' },
      });

      const result = await storage.healthCheck();

      expect(result).toBe(true);
      expect(mockDrive.files.get).toHaveBeenCalled();
      expect(mockDrive.files.create).toHaveBeenCalled();
      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'healthcheck-id' });
    });

    it('returns false on failure', async () => {
      mockDrive.files.get.mockRejectedValue(new Error('Connection failed'));
      storage = new GDriveBaseStorage(baseConfig);

      const result = await storage.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('uploadFile (BUG FIX #2 - upsert semantics)', () => {
    it('when file exists: calls files.update (not create) to avoid duplicates', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
        fileLookups: [{ parentId: rootFolderId, fileName: 'existing.txt', fileId: 'file-123' }],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await storage.uploadFile('existing.txt', Buffer.from('new content'));

      expect(mockDrive.files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-123',
          media: expect.objectContaining({ mimeType: 'application/octet-stream' }),
        }),
      );
      expect(mockDrive.files.create).not.toHaveBeenCalled();
    });

    it('when file does not exist: calls files.create', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
        fileLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      const path = await storage.uploadFile('newfile.txt', Buffer.from('data'));

      expect(path).toBe('newfile.txt');
      expect(mockDrive.files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ name: 'newfile.txt', parents: [rootFolderId] }),
        }),
      );
      expect(mockDrive.files.update).not.toHaveBeenCalled();
    });

    it('creates intermediate folders along the path', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [
          { parentId: rootFolderId, folderName: 'projects', folderId: 'proj-id' },
          { parentId: 'proj-id', folderName: 'p1', folderId: 'p1-id' },
        ],
        fileLookups: [],
      });
      // First list for folder "projects" - exists. Then "p1" - exists. Then file - not found
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'proj-id' },
      });
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'p1-id' },
      });
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: 'file-id' },
      });

      storage = new GDriveBaseStorage(baseConfig);
      await storage.uploadFile('projects/p1/asset.glb', Buffer.from('glb'));

      expect(mockDrive.files.list).toHaveBeenCalled();
      expect(mockDrive.files.create).toHaveBeenCalled();
      // create is called for the file (folders existed from lookups)
      expect(mockDrive.files.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ name: 'asset.glb', parents: ['p1-id'] }),
        }),
      );
    });
  });

  describe('downloadFile', () => {
    it('resolves path, finds file, returns buffer', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [{ parentId: rootFolderId, fileName: 'doc.txt', fileId: 'doc-id' }],
      });
      mockDrive.files.get.mockImplementation((params: any) => {
        if (params.alt === 'media') {
          return Promise.resolve({ data: new ArrayBuffer(10) });
        }
        return Promise.reject({ code: 404 });
      });
      storage = new GDriveBaseStorage(baseConfig);

      const buf = await storage.downloadFile('doc.txt');

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBe(10);
      expect(mockDrive.files.get).toHaveBeenCalledWith(
        { fileId: 'doc-id', alt: 'media' },
        { responseType: 'arraybuffer' },
      );
    });

    it('throws NOT_FOUND when file does not exist', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.downloadFile('missing.txt')).rejects.toThrow(StorageError);
      await expect(storage.downloadFile('missing.txt')).rejects.toMatchObject({
        code: StorageErrorCode.NOT_FOUND,
      });
    });
  });

  describe('deleteFile', () => {
    it('finds and deletes file', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [{ parentId: rootFolderId, fileName: 'to-delete.bin', fileId: 'del-id' }],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await storage.deleteFile('to-delete.bin');

      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'del-id' });
    });

    it('no-op when file does not exist (idempotent)', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.deleteFile('already-gone.bin')).resolves.not.toThrow();
      expect(mockDrive.files.delete).not.toHaveBeenCalled();
    });
  });

  describe('fileExists', () => {
    it('returns true when file exists', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [{ parentId: rootFolderId, fileName: 'exists.bin', fileId: 'x' }],
      });
      storage = new GDriveBaseStorage(baseConfig);

      const result = await storage.fileExists('exists.bin');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      setupListAndGetMocks({
        rootFolderId,
        fileLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      const result = await storage.fileExists('missing.bin');
      expect(result).toBe(false);
    });
  });

  describe('listFiles (BUG FIX #7)', () => {
    it('returns file NAMES, not Drive IDs', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
        listResults: {
          [rootFolderId]: [
            { id: 'drive-id-1', name: 'file1.bin', mimeType: 'application/octet-stream', size: '100' },
            { id: 'drive-id-2', name: 'file2.bin', mimeType: 'application/octet-stream', size: '200' },
          ],
        },
      });
      storage = new GDriveBaseStorage(baseConfig);

      const names = await storage.listFiles('');

      expect(names).toEqual(['file1.bin', 'file2.bin']);
      expect(names).not.toContain('drive-id-1');
      expect(names).not.toContain('drive-id-2');
    });

    it('filters out folders', async () => {
      setupListAndGetMocks({
        rootFolderId,
        listResults: {
          [rootFolderId]: [
            { id: 'f1', name: 'file.txt', mimeType: 'application/octet-stream' },
            { id: 'f2', name: 'subdir', mimeType: 'application/vnd.google-apps.folder' },
          ],
        },
      });
      storage = new GDriveBaseStorage(baseConfig);

      const names = await storage.listFiles('');

      expect(names).toEqual(['file.txt']);
      expect(names).not.toContain('subdir');
    });

    it('returns [] when folder not found', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      const names = await storage.listFiles('nonexistent/subdir');

      expect(names).toEqual([]);
    });
  });

  describe('deleteDirectory (BUG FIX #5)', () => {
    it('deletes the folder itself (Drive cascades to contents)', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [
          { parentId: rootFolderId, folderName: 'projects', folderId: 'proj-id' },
          { parentId: 'proj-id', folderName: 'p1', folderId: 'p1-id' },
        ],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await storage.deleteDirectory('projects/p1');

      expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'p1-id' });
    });

    it('no-op when folder missing', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.deleteDirectory('missing/folder')).resolves.not.toThrow();
      expect(mockDrive.files.delete).not.toHaveBeenCalled();
    });
  });

  describe('getDirectorySize', () => {
    it('calculates sizes recursively', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [{ parentId: rootFolderId, folderName: 'data', folderId: 'data-id' }],
        listResults: {
          [rootFolderId]: [
            { id: 'data-id', name: 'data', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'f1', name: 'root.txt', mimeType: 'application/octet-stream', size: '50' },
          ],
          'data-id': [
            { id: 'f2', name: 'nested.bin', mimeType: 'application/octet-stream', size: '150' },
          ],
        },
      });
      storage = new GDriveBaseStorage(baseConfig);

      const size = await storage.getDirectorySize('');

      expect(size).toBe(200); // 50 + 150
    });

    it('returns 0 for missing folder', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [],
      });
      storage = new GDriveBaseStorage(baseConfig);

      const size = await storage.getDirectorySize('missing/sub');

      expect(size).toBe(0);
    });
  });

  describe('BUG FIX #1 - Query injection', () => {
    it('filenames with single quotes are escaped in API queries', async () => {
      // Mock must match the escaped query - use escaped name in response
      const escapedName = "test\\'file.txt";
      mockDrive.files.list.mockImplementation((params: any) => {
        const q = params?.q || '';
        if (q.includes("mimeType!='application/vnd.google-apps.folder'") && q.includes(escapedName)) {
          return Promise.resolve({
            data: { files: [{ id: 'x', name: "test'file.txt", mimeType: 'application/octet-stream', size: '0' }] },
          });
        }
        return Promise.resolve({ data: { files: [] } });
      });
      mockDrive.files.get.mockImplementation((params: any) => {
        if (params.alt === 'media') return Promise.resolve({ data: new ArrayBuffer(5) });
        return Promise.reject({ code: 404 });
      });
      storage = new GDriveBaseStorage(baseConfig);

      await storage.downloadFile("test'file.txt");

      const listCalls = mockDrive.files.list.mock.calls;
      expect(listCalls.length).toBeGreaterThan(0);
      const q = listCalls[0][0].q;
      expect(q).toContain("\\'"); // escaped quote
    });

    it('q parameter passed to files.list contains escaped quotes for folder name', async () => {
      setupListAndGetMocks({
        rootFolderId,
        folderLookups: [{ parentId: rootFolderId, folderName: "O'Brien", folderId: 'ob-id' }],
      });
      storage = new GDriveBaseStorage(baseConfig);

      await storage.uploadFile("O'Brien/report.json", Buffer.from('{}'));

      const listCalls = mockDrive.files.list.mock.calls;
      const folderQueryCalls = listCalls.filter((c: any) => c[0].q?.includes("mimeType='application/vnd.google-apps.folder'"));
      expect(folderQueryCalls.length).toBeGreaterThan(0);
      const q = folderQueryCalls[0][0].q;
      expect(q).toContain("O\\'Brien"); // escaped single quote
    });
  });

  describe('BUG FIX #3 - Rate limit retry (429)', () => {
    it('retries on 429 with backoff, stops after MAX_RETRIES (5) and throws', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        (fn as () => void)();
        return 0 as any;
      });

      setupListAndGetMocks({ rootFolderId });
      const err429: any = new Error('Rate limit');
      err429.code = 429;
      err429.response = { status: 429 };
      mockDrive.files.list.mockRejectedValue(err429);

      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.listFiles('')).rejects.toThrow();

      expect(mockDrive.files.list).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
      setTimeoutSpy.mockRestore();
    });
  });

  describe('BUG FIX #4 - Auth retry (401)', () => {
    it('refreshes token on 401 and retries once', async () => {
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-token', refresh_token: 'mock-refresh' },
      });
      let callCount = 0;
      mockDrive.files.get.mockImplementation((params: any) => {
        callCount++;
        if (callCount === 1 && !params.alt) {
          const err401: any = new Error('Unauthorized');
          err401.code = 401;
          err401.response = { status: 401 };
          return Promise.reject(err401);
        }
        if (params.fileId === rootFolderId) {
          return Promise.resolve({
            data: { id: rootFolderId, name: 'root', mimeType: 'application/vnd.google-apps.folder' },
          });
        }
        return Promise.reject({ code: 404 });
      });

      storage = new GDriveBaseStorage(baseConfig);
      await storage.initialize();

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(mockDrive.files.get).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry again if second attempt also 401 (prevents infinite recursion)', async () => {
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-token', refresh_token: 'mock-refresh' },
      });
      const err401: any = new Error('Unauthorized');
      err401.code = 401;
      err401.response = { status: 401 };
      mockDrive.files.get.mockRejectedValue(err401);

      storage = new GDriveBaseStorage(baseConfig);

      await expect(storage.initialize()).rejects.toThrow();
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(mockDrive.files.get).toHaveBeenCalledTimes(2);
    });
  });
});
