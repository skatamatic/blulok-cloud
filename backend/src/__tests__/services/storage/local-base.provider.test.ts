/**
 * LocalBaseStorage Provider Unit Tests
 *
 * Tests LocalBaseStorage with real filesystem using temp directories.
 * Each test is independent with proper cleanup in afterEach/afterAll.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  LocalBaseStorage,
} from '@/services/storage/local-base.provider';
import {
  StorageError,
  StorageErrorCode,
} from '@/services/storage/base-storage.interface';

describe('LocalBaseStorage', () => {
  let baseDir: string;
  let storage: LocalBaseStorage;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-base-storage-test-'));
    storage = new LocalBaseStorage({ basePath: baseDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (dir may already be gone)
    }
  });

  describe('Constructor', () => {
    it('throws CONFIGURATION_ERROR if no basePath', () => {
      expect(() => new LocalBaseStorage({} as any)).toThrow(StorageError);
      expect(() => new LocalBaseStorage({} as any)).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('throws CONFIGURATION_ERROR if basePath is empty string', () => {
      expect(() => new LocalBaseStorage({ basePath: '' })).toThrow(StorageError);
      expect(() => new LocalBaseStorage({ basePath: '' })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.CONFIGURATION_ERROR }),
      );
    });

    it('accepts valid basePath', () => {
      const s = new LocalBaseStorage({ basePath: baseDir });
      expect(s).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('creates basePath directory', async () => {
      const newDir = path.join(baseDir, 'nested-init');
      const s = new LocalBaseStorage({ basePath: newDir });
      await s.initialize();

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('creates nested directory when basePath has multiple levels', async () => {
      const nestedDir = path.join(baseDir, 'a', 'b', 'c');
      const s = new LocalBaseStorage({ basePath: nestedDir });
      await s.initialize();

      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('returns true when dir exists and is writable', async () => {
      await storage.initialize();
      const result = await storage.healthCheck();
      expect(result).toBe(true);
    });

    it('returns true after creating .healthcheck and deleting it', async () => {
      await storage.initialize();
      const before = await fs.readdir(baseDir);
      const result = await storage.healthCheck();
      const after = await fs.readdir(baseDir);
      expect(result).toBe(true);
      expect(after).toEqual(before); // .healthcheck should be gone
    });
  });

  describe('uploadFile', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('writes file and returns logical path', async () => {
      const data = Buffer.from('hello world');
      const returned = await storage.uploadFile('foo.txt', data);
      expect(returned).toBe('foo.txt');

      const content = await fs.readFile(path.join(baseDir, 'foo.txt'), 'utf-8');
      expect(content).toBe('hello world');
    });

    it('creates intermediate dirs', async () => {
      const data = Buffer.from('nested content');
      await storage.uploadFile('a/b/c/file.txt', data);

      const fullPath = path.join(baseDir, 'a', 'b', 'c', 'file.txt');
      const stats = await fs.stat(fullPath);
      expect(stats.isFile()).toBe(true);
      expect(await fs.readFile(fullPath, 'utf-8')).toBe('nested content');
    });

    it('accepts optional contentType (no-op for local, but should not throw)', async () => {
      await storage.uploadFile('typed.bin', Buffer.from('data'), 'application/octet-stream');
      expect(await storage.fileExists('typed.bin')).toBe(true);
    });
  });

  describe('downloadFile', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('returns buffer for existing file', async () => {
      const data = Buffer.from('download me');
      await storage.uploadFile('exists.txt', data);
      const buf = await storage.downloadFile('exists.txt');
      expect(buf).toEqual(data);
      expect(Buffer.isBuffer(buf)).toBe(true);
    });

    it('throws NOT_FOUND for missing file', async () => {
      await expect(storage.downloadFile('nonexistent.txt')).rejects.toThrow(StorageError);
      await expect(storage.downloadFile('nonexistent.txt')).rejects.toMatchObject({
        code: StorageErrorCode.NOT_FOUND,
      });
    });
  });

  describe('deleteFile', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('deletes file', async () => {
      await storage.uploadFile('to-delete.txt', Buffer.from('x'));
      expect(await storage.fileExists('to-delete.txt')).toBe(true);

      await storage.deleteFile('to-delete.txt');
      expect(await storage.fileExists('to-delete.txt')).toBe(false);
    });

    it('is idempotent for missing file', async () => {
      await expect(storage.deleteFile('never-existed.txt')).resolves.not.toThrow();
    });

    it('prunes empty parent dirs', async () => {
      await storage.uploadFile('p/q/r/file.txt', Buffer.from('x'));
      expect(await storage.fileExists('p/q/r/file.txt')).toBe(true);

      await storage.deleteFile('p/q/r/file.txt');

      const pDir = path.join(baseDir, 'p');
      const qDir = path.join(baseDir, 'p', 'q');
      const rDir = path.join(baseDir, 'p', 'q', 'r');
      await expect(fs.access(pDir)).rejects.toThrow();
      await expect(fs.access(qDir)).rejects.toThrow();
      await expect(fs.access(rDir)).rejects.toThrow();
    });

    it('does not prune parent dirs that still contain other files', async () => {
      await storage.uploadFile('shared/one.txt', Buffer.from('1'));
      await storage.uploadFile('shared/two.txt', Buffer.from('2'));

      await storage.deleteFile('shared/one.txt');

      expect(await storage.fileExists('shared/two.txt')).toBe(true);
      const sharedDir = path.join(baseDir, 'shared');
      const stats = await fs.stat(sharedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('fileExists', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('returns true for existing file', async () => {
      await storage.uploadFile('exists.txt', Buffer.from('x'));
      expect(await storage.fileExists('exists.txt')).toBe(true);
    });

    it('returns false for missing file', async () => {
      expect(await storage.fileExists('missing.txt')).toBe(false);
    });

    it('returns true when path exists (file or directory)', async () => {
      await storage.uploadFile('dir/file.txt', Buffer.from('x'));
      // Implementation uses existsSync - returns true for both files and dirs
      expect(await storage.fileExists('dir/file.txt')).toBe(true);
      expect(await storage.fileExists('dir')).toBe(true); // dir exists
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('returns file names only (not subdirs)', async () => {
      await storage.uploadFile('folder/a.txt', Buffer.from('a'));
      await storage.uploadFile('folder/b.txt', Buffer.from('b'));
      await storage.uploadFile('folder/subdir/c.txt', Buffer.from('c')); // subdir

      const files = await storage.listFiles('folder');
      expect(files).toEqual(expect.arrayContaining(['a.txt', 'b.txt']));
      expect(files).not.toContain('subdir');
      expect(files).not.toContain('folder/subdir/c.txt');
    });

    it('returns empty array for missing dir', async () => {
      const files = await storage.listFiles('nonexistent-dir');
      expect(files).toEqual([]);
    });

    it('returns empty array for empty dir', async () => {
      await fs.mkdir(path.join(baseDir, 'empty'), { recursive: true });
      const files = await storage.listFiles('empty');
      expect(files).toEqual([]);
    });
  });

  describe('deleteDirectory', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('removes dir recursively', async () => {
      await storage.uploadFile('dir/a.txt', Buffer.from('a'));
      await storage.uploadFile('dir/sub/b.txt', Buffer.from('b'));

      await storage.deleteDirectory('dir');

      expect(await storage.fileExists('dir/a.txt')).toBe(false);
      expect(await storage.listFiles('dir')).toEqual([]);
      const dirPath = path.join(baseDir, 'dir');
      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('is idempotent for missing dir', async () => {
      await expect(storage.deleteDirectory('no-such-dir')).resolves.not.toThrow();
    });

    it('prunes empty parent dirs after delete', async () => {
      await storage.uploadFile('parent/child/grandchild/file.txt', Buffer.from('x'));
      await storage.deleteDirectory('parent/child/grandchild');

      const parentDir = path.join(baseDir, 'parent');
      await expect(fs.access(parentDir)).rejects.toThrow();
    });
  });

  describe('getDirectorySize', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('calculates total size recursively', async () => {
      await storage.uploadFile('dir/a.txt', Buffer.from('aaa')); // 3 bytes
      await storage.uploadFile('dir/b.txt', Buffer.from('bb'));   // 2 bytes
      await storage.uploadFile('dir/sub/c.txt', Buffer.from('c')); // 1 byte

      const size = await storage.getDirectorySize('dir');
      expect(size).toBe(6);
    });

    it('returns 0 for missing dir', async () => {
      const size = await storage.getDirectorySize('missing-dir');
      expect(size).toBe(0);
    });

    it('returns 0 for empty dir', async () => {
      await fs.mkdir(path.join(baseDir, 'empty'), { recursive: true });
      const size = await storage.getDirectorySize('empty');
      expect(size).toBe(0);
    });
  });

  describe('Path traversal protection', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('rejects ../ in uploadFile', async () => {
      await expect(
        storage.uploadFile('../escape.txt', Buffer.from('evil')),
      ).rejects.toThrow(StorageError);
      await expect(
        storage.uploadFile('../escape.txt', Buffer.from('evil')),
      ).rejects.toMatchObject({ code: StorageErrorCode.PERMISSION_DENIED });
    });

    it('rejects ../ in downloadFile', async () => {
      await expect(storage.downloadFile('../etc/passwd')).rejects.toThrow(StorageError);
      await expect(storage.downloadFile('../etc/passwd')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects ../ in deleteFile', async () => {
      await expect(storage.deleteFile('../sensitive')).rejects.toThrow(StorageError);
      await expect(storage.deleteFile('../sensitive')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects ../ in fileExists', async () => {
      await expect(storage.fileExists('../etc/passwd')).rejects.toThrow(StorageError);
      await expect(storage.fileExists('../etc/passwd')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects ../ in listFiles', async () => {
      await expect(storage.listFiles('../parent')).rejects.toThrow(StorageError);
      await expect(storage.listFiles('../parent')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects ../ in deleteDirectory', async () => {
      await expect(storage.deleteDirectory('../danger')).rejects.toThrow(StorageError);
      await expect(storage.deleteDirectory('../danger')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects ../ in getDirectorySize', async () => {
      await expect(storage.getDirectorySize('../other')).rejects.toThrow(StorageError);
      await expect(storage.getDirectorySize('../other')).rejects.toMatchObject({
        code: StorageErrorCode.PERMISSION_DENIED,
      });
    });

    it('rejects deep path traversal', async () => {
      await expect(
        storage.uploadFile('a/../../../etc/passwd', Buffer.from('x')),
      ).rejects.toMatchObject({ code: StorageErrorCode.PERMISSION_DENIED });
    });

    it('allows valid paths within base', async () => {
      await storage.uploadFile('valid/path/file.txt', Buffer.from('ok'));
      expect(await storage.fileExists('valid/path/file.txt')).toBe(true);
      const buf = await storage.downloadFile('valid/path/file.txt');
      expect(buf.toString()).toBe('ok');
    });
  });
});
