/**
 * Local Filesystem Base Storage Provider
 *
 * Stores files on the local disk.  All paths are resolved relative to a
 * configurable `basePath` and validated to prevent path-traversal attacks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import {
  BaseStorageProvider,
  LocalStorageConfig,
  StorageError,
  StorageErrorCode,
  StorageProviderType,
} from './base-storage.interface';

export class LocalBaseStorage implements BaseStorageProvider {
  readonly type = StorageProviderType.LOCAL;
  private basePath: string;

  constructor(config: LocalStorageConfig) {
    if (!config.basePath) {
      throw new StorageError(
        'Local storage requires basePath',
        StorageErrorCode.CONFIGURATION_ERROR,
      );
    }
    this.basePath = config.basePath;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testFile = path.join(this.basePath, '.healthcheck');
      await fs.writeFile(testFile, 'ok');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  // ── path safety ───────────────────────────────────────────────────────────

  /** Resolve a logical path to an absolute path, throwing if it escapes base */
  private resolveSafe(filePath: string): string {
    const resolved = path.resolve(this.basePath, filePath);
    const resolvedBase = path.resolve(this.basePath);
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      throw new StorageError(
        'Path escapes storage base directory',
        StorageErrorCode.PERMISSION_DENIED,
        { filePath },
      );
    }
    return resolved;
  }

  // ── core file operations ──────────────────────────────────────────────────

  async uploadFile(filePath: string, data: Buffer, _contentType?: string): Promise<string> {
    const abs = this.resolveSafe(filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    return filePath;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const abs = this.resolveSafe(filePath);
    try {
      return await fs.readFile(abs);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new StorageError(
          `File not found: ${filePath}`,
          StorageErrorCode.NOT_FOUND,
        );
      }
      throw err;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const abs = this.resolveSafe(filePath);
    try {
      await fs.unlink(abs);
    } catch (err: any) {
      if (err.code === 'ENOENT') return; // idempotent
      throw err;
    }
    // Clean up empty parent dirs up to basePath
    await this.pruneEmptyParents(path.dirname(abs));
  }

  async fileExists(filePath: string): Promise<boolean> {
    const abs = this.resolveSafe(filePath);
    return existsSync(abs);
  }

  async listFiles(prefix: string): Promise<string[]> {
    const abs = this.resolveSafe(prefix);
    try {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => e.name);
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  // ── directory operations ──────────────────────────────────────────────────

  async deleteDirectory(dirPath: string): Promise<void> {
    const abs = this.resolveSafe(dirPath);
    try {
      await fs.rm(abs, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    await this.pruneEmptyParents(path.dirname(abs));
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    const abs = this.resolveSafe(dirPath);
    return this.calcSize(abs);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async calcSize(dir: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await this.calcSize(full);
        } else if (entry.isFile()) {
          const stats = await fs.stat(full);
          total += stats.size;
        }
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') return 0;
      throw err;
    }
    return total;
  }

  /** Walk upward, removing empty dirs until we hit basePath */
  private async pruneEmptyParents(dir: string): Promise<void> {
    const resolvedBase = path.resolve(this.basePath);
    let current = path.resolve(dir);
    while (current.startsWith(resolvedBase + path.sep) && current !== resolvedBase) {
      try {
        const entries = await fs.readdir(current);
        if (entries.length > 0) break;
        await fs.rmdir(current);
        current = path.dirname(current);
      } catch {
        break;
      }
    }
  }
}
