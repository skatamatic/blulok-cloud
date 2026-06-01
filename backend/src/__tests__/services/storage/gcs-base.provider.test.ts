/**
 * GCSBaseStorage Provider Unit Tests
 *
 * Tests GCSBaseStorage with mocked @google-cloud/storage.
 */

import { GCSBaseStorage } from '@/services/storage/gcs-base.provider';
import {
  StorageError,
  StorageErrorCode,
} from '@/services/storage/base-storage.interface';

jest.mock('@google-cloud/storage', () => {
  const mockFile = {
    save: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue([Buffer.from('test')]),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue([true]),
    getMetadata: jest.fn().mockResolvedValue([{ size: 100 }]),
    createResumableUpload: jest.fn().mockResolvedValue([
      'https://storage.googleapis.com/upload/storage/v1/b/test-bucket/o?uploadType=resumable&upload_id=abc',
    ]),
  };
  const mockBucket = {
    exists: jest.fn().mockResolvedValue([true]),
    file: jest.fn(() => mockFile),
    getFiles: jest.fn().mockResolvedValue([[]]),
  };
  const MockStorage = jest.fn(() => ({
    bucket: jest.fn(() => mockBucket),
  }));
  return { Storage: MockStorage, __mockBucket: mockBucket, __mockFile: mockFile };
});

describe('GCSBaseStorage', () => {
  let storage: GCSBaseStorage;
  let mockBucket: any;
  let mockFile: any;

  const baseConfig = { bucketName: 'test-bucket', projectId: 'test-project' };

  beforeEach(() => {
    jest.clearAllMocks();
    const storageModule = require('@google-cloud/storage');
    mockBucket = storageModule.__mockBucket;
    mockFile = storageModule.__mockFile;

    mockBucket.file.mockReturnValue(mockFile);
    mockFile.exists.mockResolvedValue([true]);
    mockFile.save.mockResolvedValue(undefined);
    mockFile.download.mockResolvedValue([Buffer.from('test')]);
    mockFile.delete.mockResolvedValue(undefined);
    mockFile.getMetadata.mockResolvedValue([{ size: 100 }]);
    mockBucket.exists.mockResolvedValue([true]);
    mockBucket.getFiles.mockResolvedValue([[]]);
  });

  describe('Constructor validation', () => {
    it('throws CONFIGURATION_ERROR without bucketName', () => {
      expect(() => new GCSBaseStorage({ ...baseConfig, bucketName: '' })).toThrow(StorageError);
      expect(() => new GCSBaseStorage({ ...baseConfig, bucketName: '' })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR without projectId', () => {
      expect(() => new GCSBaseStorage({ ...baseConfig, projectId: '' })).toThrow(StorageError);
      expect(() => new GCSBaseStorage({ projectId: '' } as any)).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR when bucketName is undefined', () => {
      expect(() => new GCSBaseStorage({ projectId: 'p' } as any)).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR when projectId is undefined', () => {
      expect(() => new GCSBaseStorage({ bucketName: 'b' } as any)).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('accepts keyFilePath', () => {
      const s = new GCSBaseStorage({
        ...baseConfig,
        keyFilePath: '/path/to/key.json',
      });
      expect(s).toBeDefined();
    });

    it('accepts keyFileContents as JSON', () => {
      const s = new GCSBaseStorage({
        ...baseConfig,
        keyFileContents: JSON.stringify({ type: 'service_account', project_id: 'test' }),
      });
      expect(s).toBeDefined();
    });

    it('throws CONFIGURATION_ERROR for invalid keyFileContents JSON', () => {
      expect(() =>
        new GCSBaseStorage({
          ...baseConfig,
          keyFileContents: 'not valid json {',
        }),
      ).toThrow(StorageError);
      expect(() =>
        new GCSBaseStorage({
          ...baseConfig,
          keyFileContents: 'not valid json {',
        }),
      ).toThrow(expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }));
    });
  });

  describe('initialize', () => {
    it('succeeds when bucket exists', async () => {
      storage = new GCSBaseStorage(baseConfig);
      await expect(storage.initialize()).resolves.not.toThrow();
      expect(mockBucket.exists).toHaveBeenCalled();
    });

    it('throws PERMISSION_DENIED when bucket does not exist', async () => {
      mockBucket.exists.mockResolvedValue([false]);
      storage = new GCSBaseStorage(baseConfig);

      await expect(storage.initialize()).rejects.toThrow(StorageError);
      await expect(storage.initialize()).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });
  });

  describe('healthCheck', () => {
    it('returns true on success', async () => {
      storage = new GCSBaseStorage(baseConfig);
      const result = await storage.healthCheck();
      expect(result).toBe(true);
      expect(mockBucket.exists).toHaveBeenCalled();
      expect(mockFile.save).toHaveBeenCalledWith('ok');
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('returns false on failure', async () => {
      mockBucket.exists.mockResolvedValue([false]);
      storage = new GCSBaseStorage(baseConfig);

      const result = await storage.healthCheck();
      expect(result).toBe(false);
    });

    it('returns false when save throws', async () => {
      mockFile.save.mockRejectedValue(new Error('write failed'));
      storage = new GCSBaseStorage(baseConfig);

      const result = await storage.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('uploadFile', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('saves with correct metadata and returns path', async () => {
      const data = Buffer.from('upload content');
      const path = await storage.uploadFile('firmware/abc/v1.bin', data, 'application/octet-stream');

      expect(path).toBe('firmware/abc/v1.bin');
      expect(mockBucket.file).toHaveBeenCalledWith('firmware/abc/v1.bin');
      expect(mockFile.save).toHaveBeenCalledWith(
        data,
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/octet-stream',
            metadata: expect.objectContaining({
              uploadedAt: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('uses guessed contentType when not provided', async () => {
      await storage.uploadFile('model.glb', Buffer.from('data'));

      expect(mockFile.save).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'model/gltf-binary',
          }),
        }),
      );
    });
  });

  describe('downloadFile', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('returns buffer', async () => {
      mockFile.download.mockResolvedValue([Buffer.from('downloaded content')]);
      const buf = await storage.downloadFile('firmware/abc/v1.bin');

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.toString()).toBe('downloaded content');
    });

    it('throws NOT_FOUND when file missing (exists returns false)', async () => {
      mockFile.exists.mockResolvedValue([false]);

      await expect(storage.downloadFile('missing.bin')).rejects.toThrow(StorageError);
      await expect(storage.downloadFile('missing.bin')).rejects.toMatchObject({
        code: StorageErrorCode.NOT_FOUND,
      });
    });

    it('throws NOT_FOUND when download returns 404', async () => {
      mockFile.exists.mockResolvedValue([true]);
      const err: any = new Error('Not Found');
      err.code = 404;
      mockFile.download.mockRejectedValue(err);

      await expect(storage.downloadFile('missing.bin')).rejects.toThrow(StorageError);
      await expect(storage.downloadFile('missing.bin')).rejects.toMatchObject({
        code: StorageErrorCode.NOT_FOUND,
      });
    });
  });

  describe('deleteFile', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('calls delete', async () => {
      await storage.deleteFile('firmware/abc/v1.bin');

      expect(mockBucket.file).toHaveBeenCalledWith('firmware/abc/v1.bin');
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('is idempotent on 404', async () => {
      const err: any = new Error('Not Found');
      err.code = 404;
      mockFile.delete.mockRejectedValue(err);

      await expect(storage.deleteFile('already-gone.bin')).resolves.not.toThrow();
    });
  });

  describe('fileExists', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('returns true when file exists', async () => {
      mockFile.exists.mockResolvedValue([true]);
      const result = await storage.fileExists('exists.bin');
      expect(result).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      mockFile.exists.mockResolvedValue([false]);
      const result = await storage.fileExists('missing.bin');
      expect(result).toBe(false);
    });
  });

  describe('listFiles', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('extracts file names from full paths', async () => {
      const mockFiles = [
        { name: 'firmware/abc/v1.bin', delete: mockFile.delete, getMetadata: mockFile.getMetadata },
        { name: 'firmware/abc/v2.bin', delete: mockFile.delete, getMetadata: mockFile.getMetadata },
      ];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const files = await storage.listFiles('firmware/abc');

      expect(files).toEqual(['v1.bin', 'v2.bin']);
      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'firmware/abc/' });
    });

    it('adds trailing slash to prefix when missing', async () => {
      mockBucket.getFiles.mockResolvedValue([[]]);

      await storage.listFiles('firmware');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'firmware/' });
    });

    it('filters empty strings', async () => {
      const mockFiles = [
        { name: 'firmware/abc/v1.bin', delete: mockFile.delete, getMetadata: mockFile.getMetadata },
        { name: 'firmware/abc/', delete: mockFile.delete, getMetadata: mockFile.getMetadata },
      ];
      mockBucket.getFiles.mockResolvedValue([mockFiles]);

      const files = await storage.listFiles('firmware/abc');

      expect(files).toEqual(['v1.bin']);
      expect(files).not.toContain('');
    });
  });

  describe('deleteDirectory', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('deletes all files with prefix', async () => {
      const file1 = { name: 'dir/a.bin', delete: jest.fn().mockResolvedValue(undefined), getMetadata: mockFile.getMetadata };
      const file2 = { name: 'dir/b.bin', delete: jest.fn().mockResolvedValue(undefined), getMetadata: mockFile.getMetadata };
      mockBucket.getFiles.mockResolvedValue([[file1, file2]]);

      await storage.deleteDirectory('dir');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'dir/' });
      expect(file1.delete).toHaveBeenCalled();
      expect(file2.delete).toHaveBeenCalled();
    });

    it('adds trailing slash to dirPath when missing', async () => {
      mockBucket.getFiles.mockResolvedValue([[]]);

      await storage.deleteDirectory('dir');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'dir/' });
    });

    it('does nothing when no files match', async () => {
      mockBucket.getFiles.mockResolvedValue([[]]);

      await expect(storage.deleteDirectory('empty-dir')).resolves.not.toThrow();
      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'empty-dir/' });
    });
  });

  describe('createResumableUploadSession', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('returns session URL and Content-Type header', async () => {
      const result = await storage.createResumableUploadSession('firmware/abc/v1.bin', {
        contentType: 'application/octet-stream',
      });

      expect(result.url).toContain('uploadType=resumable');
      expect(result.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
      expect(mockFile.createResumableUpload).toHaveBeenCalledWith({
        metadata: { contentType: 'application/octet-stream' },
      });
    });

    it('passes browser origin for CORS when provided', async () => {
      await storage.createResumableUploadSession('firmware/abc/v1.bin', {
        contentType: 'application/octet-stream',
        origin: 'https://app.example.com',
      });

      expect(mockFile.createResumableUpload).toHaveBeenCalledWith({
        metadata: { contentType: 'application/octet-stream' },
        origin: 'https://app.example.com',
      });
    });

    it('throws PERMISSION_DENIED when session creation fails', async () => {
      mockFile.createResumableUpload.mockRejectedValue(new Error('Access denied'));

      await expect(
        storage.createResumableUploadSession('firmware/abc/v1.bin', {}),
      ).rejects.toMatchObject({ code: StorageErrorCode.PERMISSION_DENIED });
    });
  });

  describe('getDirectorySize', () => {
    beforeEach(() => {
      storage = new GCSBaseStorage(baseConfig);
    });

    it('sums metadata sizes', async () => {
      const file1 = { name: 'dir/a.bin', delete: mockFile.delete, getMetadata: jest.fn().mockResolvedValue([{ size: 100 }]) };
      const file2 = { name: 'dir/b.bin', delete: mockFile.delete, getMetadata: jest.fn().mockResolvedValue([{ size: 250 }]) };
      mockBucket.getFiles.mockResolvedValue([[file1, file2]]);

      const size = await storage.getDirectorySize('dir');

      expect(size).toBe(350);
      expect(file1.getMetadata).toHaveBeenCalled();
      expect(file2.getMetadata).toHaveBeenCalled();
    });

    it('returns 0 for empty directory', async () => {
      mockBucket.getFiles.mockResolvedValue([[]]);

      const size = await storage.getDirectorySize('empty');

      expect(size).toBe(0);
    });

    it('adds trailing slash to dirPath when missing', async () => {
      mockBucket.getFiles.mockResolvedValue([[]]);

      await storage.getDirectorySize('dir');

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: 'dir/' });
    });
  });
});
