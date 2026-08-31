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
   * Resumable upload session for browser PUT uploads (bypasses Cloud Run HTTP/1 32 MiB limit).
   * Uses OAuth via the runtime service account — no iam.serviceAccounts.signBlob required.
   */
  async createResumableUploadSession(
    filePath: string,
    options: { contentType?: string; origin?: string },
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const file = this.bucket.file(filePath);
    const contentType = options.contentType || this.guessContentType(filePath);
    const createOptions: { metadata: { contentType: string }; origin?: string } = {
      metadata: { contentType },
    };
    if (options.origin) {
      createOptions.origin = options.origin;
    }

    try {
      const [url] = await file.createResumableUpload(createOptions);
      return {
        url,
        headers: { 'Content-Type': contentType },
      };
    } catch (error: any) {
      throw new StorageError(
        `Failed to create upload session: ${error.message}`,
        StorageErrorCode.PERMISSION_DENIED,
        { originalError: error.message },
      );
    }
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

  /**
   * V4 signed URL for HTTPS GET downloads (e.g. firmware OTA v2).
   * Requires a credential that can sign (key file or iam.serviceAccounts.signBlob).
   */
  async createSignedDownloadUrl(filePath: string, expiresInSeconds: number): Promise<string> {
    const exists = await this.fileExists(filePath);
    if (!exists) {
      throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
    }
    const file = this.bucket.file(filePath);
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
      return url;
    } catch (error: any) {
      throw new StorageError(
        `Failed to create signed download URL: ${error.message}`,
        StorageErrorCode.PERMISSION_DENIED,
        { originalError: error.message },
      );
    }
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
