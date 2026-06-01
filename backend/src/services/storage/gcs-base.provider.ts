/**
 * Google Cloud Storage Base Provider
 *
 * Stores files as objects inside a GCS bucket.  Logical paths map 1:1 to
 * object keys (e.g. `firmware/abc/v1.bin` → gs://bucket/firmware/abc/v1.bin).
 */

import * as crypto from 'crypto';
import { Storage, Bucket } from '@google-cloud/storage';
import {
  BaseStorageProvider,
  GCSStorageConfig,
  StorageError,
  StorageErrorCode,
  StorageProviderType,
} from './base-storage.interface';

export class GCSBaseStorage implements BaseStorageProvider {
  readonly type = StorageProviderType.GCS;
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor(config: GCSStorageConfig) {
    if (!config.bucketName) {
      throw new StorageError('GCS bucket name is required', StorageErrorCode.CONFIGURATION_ERROR);
    }
    if (!config.projectId) {
      throw new StorageError('GCS project ID is required', StorageErrorCode.CONFIGURATION_ERROR);
    }

    this.bucketName = config.bucketName;

    const storageOptions: Record<string, unknown> = { projectId: config.projectId };
    if (config.keyFilePath) {
      storageOptions.keyFilename = config.keyFilePath;
    } else if (config.keyFileContents) {
      try {
        storageOptions.credentials = JSON.parse(config.keyFileContents);
      } catch {
        throw new StorageError(
          'Invalid key file contents: must be valid JSON',
          StorageErrorCode.CONFIGURATION_ERROR,
        );
      }
    }

    this.storage = new Storage(storageOptions as any);
    this.bucket = this.storage.bucket(this.bucketName);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const [exists] = await this.bucket.exists();
    if (!exists) {
      throw new StorageError(
        `Bucket ${this.bucketName} does not exist or is not accessible`,
        StorageErrorCode.PERMISSION_DENIED,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const [exists] = await this.bucket.exists();
      if (!exists) return false;
      const testFile = this.bucket.file('.healthcheck');
      await testFile.save('ok');
      await testFile.delete();
      return true;
    } catch {
      return false;
    }
  }

  // ── core file operations ──────────────────────────────────────────────────

  async uploadFile(filePath: string, data: Buffer, contentType?: string): Promise<string> {
    const file = this.bucket.file(filePath);
    await file.save(data, {
      metadata: {
        contentType: contentType || this.guessContentType(filePath),
        metadata: { uploadedAt: new Date().toISOString() },
      },
    });
    return filePath;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const file = this.bucket.file(filePath);
    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
      }
      const [buffer] = await file.download();
      return buffer;
    } catch (error: any) {
      if (error instanceof StorageError) throw error;
      if (error.code === 404) {
        throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
      }
      throw new StorageError(
        `Failed to download file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const file = this.bucket.file(filePath);
    try {
      await file.delete();
    } catch (error: any) {
      if (error.code === 404) return; // idempotent
      throw new StorageError(
        `Failed to delete file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    const file = this.bucket.file(filePath);
    const [exists] = await file.exists();
    return exists;
  }

  async getFileSize(filePath: string): Promise<number> {
    const file = this.bucket.file(filePath);
    const [metadata] = await file.getMetadata();
    const size = metadata.size;
    const parsed = typeof size === 'number' ? size : parseInt(String(size || '0'), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new StorageError(`Invalid file size for: ${filePath}`, StorageErrorCode.PROVIDER_ERROR);
    }
    return parsed;
  }

  /**
   * V4 signed URL for browser/client PUT uploads (bypasses Cloud Run HTTP/1 32 MiB limit).
   */
  async getSignedUploadUrl(
    filePath: string,
    options: { contentType?: string; minBytes?: number; maxBytes: number; expiresSeconds?: number },
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const file = this.bucket.file(filePath);
    const minBytes = Math.max(1, options.minBytes ?? 1);
    const maxBytes = Math.max(minBytes, options.maxBytes);
    const contentType = options.contentType || this.guessContentType(filePath);
    const expiresMs = (options.expiresSeconds ?? 3600) * 1000;
    const lengthRange = `${minBytes},${maxBytes}`;

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresMs,
      contentType,
      extensionHeaders: {
        'X-Goog-Content-Length-Range': lengthRange,
      },
    });

    return {
      url,
      headers: {
        'Content-Type': contentType,
        'X-Goog-Content-Length-Range': lengthRange,
      },
    };
  }

  async hashFileSha256(filePath: string): Promise<string> {
    const file = this.bucket.file(filePath);
    const hash = crypto.createHash('sha256');
    return new Promise((resolve, reject) => {
      file
        .createReadStream()
        .on('data', (chunk: Buffer) => hash.update(chunk))
        .on('end', () => resolve(hash.digest('hex')))
        .on('error', reject);
    });
  }

  async listFiles(prefix: string): Promise<string[]> {
    const normalised = prefix.endsWith('/') ? prefix : `${prefix}/`;
    try {
      const [files] = await this.bucket.getFiles({ prefix: normalised });
      return files
        .map(f => {
          const parts = f.name.split('/');
          return parts[parts.length - 1];
        })
        .filter(Boolean); // exclude empty strings from trailing slashes
    } catch (error: any) {
      throw new StorageError(
        `Failed to list files: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  // ── directory operations ──────────────────────────────────────────────────

  async deleteDirectory(dirPath: string): Promise<void> {
    const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      if (files.length > 0) {
        await Promise.all(files.map(f => f.delete()));
      }
    } catch (error: any) {
      throw new StorageError(
        `Failed to delete directory: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      let total = 0;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const size = metadata.size;
        total += typeof size === 'number' ? size : parseInt(String(size || '0'), 10);
      }
      return total;
    } catch (error: any) {
      throw new StorageError(
        `Failed to calculate directory size: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private guessContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      json: 'application/json',
      glb: 'model/gltf-binary',
      gltf: 'model/gltf+json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bin: 'application/octet-stream',
      hex: 'application/octet-stream',
      fw: 'application/octet-stream',
      img: 'application/octet-stream',
    };
    return map[ext || ''] || 'application/octet-stream';
  }
}
