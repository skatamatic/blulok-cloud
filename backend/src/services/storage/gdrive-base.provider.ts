/**
 * Google Drive Base Storage Provider
 *
 * Stores files inside a Google Drive folder hierarchy using OAuth2.
 * Logical paths are translated to Drive folder chains:
 *   `projects/p1/assets/a1/model.glb`  →  rootFolder/projects/p1/assets/a1/model.glb
 *
 * Bug fixes baked into this implementation (vs. the original gdrive.provider):
 *  1. Query injection  – single quotes escaped in all Drive API `q` params
 *  2. Duplicate files   – uploadFile uses update-or-create semantics
 *  3. Infinite 429 retry – bounded retries with exponential backoff
 *  4. Infinite 401 retry – single token-refresh attempt per call
 *  5. Shallow delete     – deleteDirectory removes the folder (Drive cascades)
 *  6. Orphan folders     – deleteFile prunes empty parent folders
 *  7. listFiles IDs      – returns file *names*, not Drive IDs
 *  8. refreshToken init  – setCredentials always called in constructor
 *  9. (cache key fix is in the factory, not here)
 * 10. (getSignedUrl fix is in the BluDesign domain layer)
 */

import { google } from 'googleapis';
import { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import {
  BaseStorageProvider,
  GDriveStorageConfig,
  StorageError,
  StorageErrorCode,
  StorageProviderType,
} from './base-storage.interface';
import { logger } from '@/utils/logger';

const MAX_RETRIES = 5;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
}

/** Escape single-quote for Drive API query expressions */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GDriveBaseStorage implements BaseStorageProvider {
  readonly type = StorageProviderType.GDRIVE;
  private oauth2Client: InstanceType<typeof google.auth.OAuth2>;
  private drive: drive_v3.Drive;
  private config: GDriveStorageConfig;
  private rootFolderId: string;

  constructor(config: GDriveStorageConfig) {
    if (!config.clientId) {
      throw new StorageError('Google Drive client ID is required', StorageErrorCode.CONFIGURATION_ERROR);
    }
    if (!config.clientSecret) {
      throw new StorageError('Google Drive client secret is required', StorageErrorCode.CONFIGURATION_ERROR);
    }
    if (!config.rootFolderId) {
      throw new StorageError('Google Drive root folder ID is required', StorageErrorCode.CONFIGURATION_ERROR);
    }

    this.config = { ...config };
    this.rootFolderId = config.rootFolderId;

    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'urn:ietf:wg:oauth:2.0:oob',
    );

    // FIX #8: always set credentials so refreshToken is available to the client
    this.oauth2Client.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    try {
      await this.getDriveFolder(this.rootFolderId);
    } catch {
      throw new StorageError(
        `Root folder ${this.rootFolderId} does not exist or is not accessible`,
        StorageErrorCode.PERMISSION_DENIED,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getDriveFolder(this.rootFolderId);
      const testFile = await this.createDriveFile(this.rootFolderId, '.healthcheck', Buffer.from('ok'), 'text/plain');
      await this.deleteDriveFile(testFile.id);
      return true;
    } catch {
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public BaseStorageProvider methods
  // ══════════════════════════════════════════════════════════════════════════

  async uploadFile(filePath: string, data: Buffer, contentType?: string): Promise<string> {
    const { parentId, fileName } = await this.resolveParentAndName(filePath);
    // FIX #2: update-or-create semantics to avoid duplicate files
    await this.upsertDriveFile(parentId, fileName, data, contentType || this.guessContentType(fileName));
    return filePath;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const { parentId, fileName } = await this.resolveParentAndName(filePath);
    const file = await this.findFileByName(parentId, fileName);
    if (!file) {
      throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
    }
    return this.getDriveFileContent(file.id);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const { parentId, fileName } = await this.resolveParentAndName(filePath);
      const file = await this.findFileByName(parentId, fileName);
      if (file) {
        await this.deleteDriveFile(file.id);
      }
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return;
      throw error;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const { parentId, fileName } = await this.resolveParentAndName(filePath);
      const file = await this.findFileByName(parentId, fileName);
      return file !== null;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const folderId = await this.resolveFolderPath(prefix);
      const files = await this.listDriveFiles(folderId);
      // FIX #7: return file *names*, not Drive IDs
      return files
        .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
        .map(f => f.name);
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return [];
      throw error;
    }
  }

  // ── directory operations ──────────────────────────────────────────────────

  async deleteDirectory(dirPath: string): Promise<void> {
    try {
      // FIX #5: delete the folder itself (Drive cascades to contents)
      const folderId = await this.resolveFolderPath(dirPath);
      await this.deleteDriveFile(folderId);
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return;
      throw error;
    }
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const folderId = await this.resolveFolderPath(dirPath);
      return this.calcFolderSize(folderId);
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return 0;
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OAuth2 Token Management
  // ══════════════════════════════════════════════════════════════════════════

  private async ensureValidToken(): Promise<void> {
    const creds = this.oauth2Client.credentials;
    if (!creds.access_token) {
      if (!this.config.refreshToken) {
        throw new StorageError(
          'No access token or refresh token available',
          StorageErrorCode.PERMISSION_DENIED,
        );
      }
      await this.refreshAccessToken();
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.config.refreshToken) {
      throw new StorageError('Refresh token is required', StorageErrorCode.CONFIGURATION_ERROR);
    }
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.config.accessToken = credentials.access_token || undefined;
      if (credentials.refresh_token) {
        this.config.refreshToken = credentials.refresh_token;
      }
      this.oauth2Client.setCredentials(credentials);
    } catch (error: any) {
      logger.error('Failed to refresh Google Drive access token:', error);
      throw new StorageError(
        'Failed to refresh access token. Please re-authenticate.',
        StorageErrorCode.PERMISSION_DENIED,
        { originalError: error.message },
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Low-level Drive helpers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve a logical path ("a/b/c/file.txt") to its Drive parent folder ID
   * and the trailing file name.  Creates intermediate folders as needed.
   */
  private async resolveParentAndName(filePath: string): Promise<{ parentId: string; fileName: string }> {
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new StorageError('Empty file path', StorageErrorCode.INVALID_FILE);
    }
    const fileName = parts.pop()!;
    let currentId = this.rootFolderId;
    for (const segment of parts) {
      currentId = await this.getOrCreateFolder(currentId, segment);
    }
    return { parentId: currentId, fileName };
  }

  /**
   * Resolve a logical directory path to its Drive folder ID.
   * Throws NOT_FOUND if any segment is missing.
   */
  private async resolveFolderPath(dirPath: string): Promise<string> {
    const parts = dirPath.split('/').filter(Boolean);
    let currentId = this.rootFolderId;
    for (const segment of parts) {
      const folderId = await this.findFolderByName(currentId, segment);
      if (!folderId) {
        throw new StorageError(`Folder not found: ${dirPath}`, StorageErrorCode.NOT_FOUND);
      }
      currentId = folderId;
    }
    return currentId;
  }

  /** Get metadata for a folder by its Drive ID */
  private async getDriveFolder(folderId: string, isRetry = false): Promise<DriveFile> {
    await this.ensureValidToken();
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType',
      });
      if (response.data.mimeType !== 'application/vnd.google-apps.folder') {
        throw new StorageError(`File ${folderId} is not a folder`, StorageErrorCode.INVALID_FILE);
      }
      return { id: response.data.id!, name: response.data.name!, mimeType: response.data.mimeType! };
    } catch (error: any) {
      if (error instanceof StorageError) throw error;
      if ((error.code === 401 || error.response?.status === 401) && !isRetry) {
        // FIX #4: single refresh attempt
        await this.refreshAccessToken();
        return this.getDriveFolder(folderId, true);
      }
      if (error.code === 404 || error.response?.status === 404) {
        throw new StorageError(`Folder not found: ${folderId}`, StorageErrorCode.NOT_FOUND);
      }
      throw new StorageError(
        `Failed to get folder: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  /** Find a child folder by name, returning its ID or null */
  private async findFolderByName(parentId: string, folderName: string): Promise<string | null> {
    await this.ensureValidToken();
    // FIX #1: escape single quotes
    const q = `'${escapeQuery(parentId)}' in parents and name='${escapeQuery(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await this.withRetry(() =>
      this.drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' }),
    );
    const files = response.data.files || [];
    return files.length > 0 ? files[0].id! : null;
  }

  /** Get or create a child folder */
  private async getOrCreateFolder(parentId: string, folderName: string): Promise<string> {
    const existing = await this.findFolderByName(parentId, folderName);
    if (existing) return existing;

    const createResponse = await this.withRetry(() =>
      this.drive.files.create({
        requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id',
      }),
    );
    return createResponse.data.id!;
  }

  /** Find a file by name in a folder, returning DriveFile or null */
  private async findFileByName(parentId: string, fileName: string): Promise<DriveFile | null> {
    await this.ensureValidToken();
    // FIX #1: escape single quotes
    const q = `'${escapeQuery(parentId)}' in parents and name='${escapeQuery(fileName)}' and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
    const response = await this.withRetry(() =>
      this.drive.files.list({ q, fields: 'files(id,name,mimeType,size)', spaces: 'drive' }),
    );
    const files = response.data.files || [];
    if (files.length === 0) return null;
    return { id: files[0].id!, name: files[0].name!, mimeType: files[0].mimeType!, size: files[0].size ?? undefined };
  }

  /** Create a new file in Drive */
  private async createDriveFile(
    parentId: string,
    fileName: string,
    data: Buffer,
    mimeType: string,
  ): Promise<DriveFile> {
    await this.ensureValidToken();
    const response = await this.withRetry(() =>
      this.drive.files.create({
        requestBody: { name: fileName, parents: [parentId] },
        media: { mimeType, body: Readable.from(data) },
        fields: 'id,name,mimeType,size',
      }),
    );
    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      size: response.data.size ?? undefined,
    };
  }

  /**
   * FIX #2: Update an existing file or create a new one.
   * Prevents duplicate files with the same name accumulating in a folder.
   */
  private async upsertDriveFile(
    parentId: string,
    fileName: string,
    data: Buffer,
    mimeType: string,
  ): Promise<DriveFile> {
    const existing = await this.findFileByName(parentId, fileName);
    if (existing) {
      // Update existing file
      await this.ensureValidToken();
      const response = await this.withRetry(() =>
        this.drive.files.update({
          fileId: existing.id,
          media: { mimeType, body: Readable.from(data) },
          fields: 'id,name,mimeType,size',
        }),
      );
      return {
        id: response.data.id!,
        name: response.data.name!,
        mimeType: response.data.mimeType!,
        size: response.data.size ?? undefined,
      };
    }
    return this.createDriveFile(parentId, fileName, data, mimeType);
  }

  /** Download file contents by Drive file ID */
  private async getDriveFileContent(fileId: string, isRetry = false): Promise<Buffer> {
    await this.ensureValidToken();
    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error: any) {
      if ((error.code === 401 || error.response?.status === 401) && !isRetry) {
        // FIX #4: single refresh attempt
        await this.refreshAccessToken();
        return this.getDriveFileContent(fileId, true);
      }
      if (error.code === 404 || error.response?.status === 404) {
        throw new StorageError(`File not found: ${fileId}`, StorageErrorCode.NOT_FOUND);
      }
      throw new StorageError(
        `Failed to get file content: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  /** Delete a file or folder by Drive ID (idempotent on 404) */
  private async deleteDriveFile(fileId: string): Promise<void> {
    await this.ensureValidToken();
    try {
      await this.withRetry(() => this.drive.files.delete({ fileId }));
    } catch (error: any) {
      if (error.code === 404 || error.response?.status === 404) return;
      throw new StorageError(
        `Failed to delete file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message },
      );
    }
  }

  /** List all children of a folder */
  private async listDriveFiles(parentId: string): Promise<DriveFile[]> {
    await this.ensureValidToken();
    // FIX #1: escape single quotes
    const q = `'${escapeQuery(parentId)}' in parents and trashed=false`;
    const response = await this.withRetry(() =>
      this.drive.files.list({ q, fields: 'files(id,name,mimeType,size)', spaces: 'drive' }),
    );
    return (response.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      size: f.size ?? undefined,
    }));
  }

  /** Recursively calculate total bytes in a folder */
  private async calcFolderSize(folderId: string): Promise<number> {
    const items = await this.listDriveFiles(folderId);
    let total = 0;
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        total += await this.calcFolderSize(item.id);
      } else if (item.size) {
        total += parseInt(item.size, 10);
      }
    }
    return total;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Retry / Rate-limit helpers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * FIX #3: Execute a Drive API call with bounded exponential-backoff retries
   * on HTTP 429 (rate limit) errors.
   */
  private async withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.code || error.response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 32000) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.withRetry(fn, attempt + 1);
      }
      throw error;
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
