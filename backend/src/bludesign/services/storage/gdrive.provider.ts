/**
 * Google Drive Storage Provider (BluDesign Domain Layer)
 *
 * Thin domain adapter that delegates file I/O to GDriveBaseStorage,
 * adding BluDesign-specific path conventions and zip operations.
 *
 * All low-level Drive bugs (query injection, duplicate files, infinite retries,
 * etc.) are fixed in the base provider.
 */

import * as path from 'path';
import { Readable } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {
  StorageProvider,
  StorageError,
  StorageErrorCode,
  GDriveProviderConfig,
} from './storage-provider.interface';
import { GDriveBaseStorage } from '@/services/storage/gdrive-base.provider';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

export class GDriveStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.GDRIVE;
  private base: GDriveBaseStorage;
  private maxFileSizeMb: number;
  private allowedExtensions: string[];

  constructor(config: GDriveProviderConfig & { maxFileSizeMb?: number; allowedExtensions?: string[] }) {
    this.base = new GDriveBaseStorage(config);
    this.maxFileSizeMb = config.maxFileSizeMb ?? 100;
    this.allowedExtensions = config.allowedExtensions ?? [
      '.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp', '.json',
    ];
  }

  // ── validation ────────────────────────────────────────────────────────────

  private validateExtension(filename: string): void {
    const ext = path.extname(filename).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new StorageError(
        `File extension ${ext} not allowed`,
        StorageErrorCode.INVALID_FILE,
        { allowedExtensions: this.allowedExtensions },
      );
    }
  }

  private validateFileSize(data: Buffer): void {
    const sizeMb = data.length / (1024 * 1024);
    if (sizeMb > this.maxFileSizeMb) {
      throw new StorageError(
        `File size ${sizeMb.toFixed(2)}MB exceeds maximum ${this.maxFileSizeMb}MB`,
        StorageErrorCode.QUOTA_EXCEEDED,
      );
    }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> { await this.base.initialize(); }
  async healthCheck(): Promise<boolean> { return this.base.healthCheck(); }

  // ── path helpers ──────────────────────────────────────────────────────────

  private assetPath(projectId: string, assetId: string, filename?: string): string {
    return filename
      ? `projects/${projectId}/assets/${assetId}/${filename}`
      : `projects/${projectId}/assets/${assetId}`;
  }
  private texturePath(projectId: string, assetId: string, textureName: string): string {
    return `projects/${projectId}/assets/${assetId}/textures/${textureName}`;
  }
  private textureDir(projectId: string, assetId: string): string {
    return `projects/${projectId}/assets/${assetId}/textures`;
  }
  private facilityPrefix(projectId: string, facilityId: string): string {
    return `projects/${projectId}/facilities/${facilityId}`;
  }
  private facilitiesDir(projectId: string): string {
    return `projects/${projectId}/facilities`;
  }
  private globalAssetPath(modelId: string, filename?: string): string {
    return filename ? `global/models/${modelId}/${filename}` : `global/models/${modelId}`;
  }
  private projectPath(projectId: string): string { return `projects/${projectId}`; }

  // ── Asset Operations ──────────────────────────────────────────────────────

  async uploadAssetFile(projectId: string, assetId: string, filename: string, data: Buffer, contentType: string): Promise<string> {
    this.validateExtension(filename);
    this.validateFileSize(data);
    return this.base.uploadFile(this.assetPath(projectId, assetId, filename), data, contentType);
  }

  async downloadAssetFile(projectId: string, assetId: string, filename: string): Promise<Buffer> {
    return this.base.downloadFile(this.assetPath(projectId, assetId, filename));
  }

  async deleteAssetFiles(projectId: string, assetId: string): Promise<void> {
    await this.base.deleteDirectory(this.assetPath(projectId, assetId));
  }

  async listAssetFiles(projectId: string, assetId: string): Promise<string[]> {
    return this.base.listFiles(this.assetPath(projectId, assetId));
  }

  // ── Global Asset Operations ───────────────────────────────────────────────

  async uploadGlobalAsset(modelId: string, filename: string, data: Buffer, contentType: string): Promise<string> {
    this.validateExtension(filename);
    this.validateFileSize(data);
    return this.base.uploadFile(this.globalAssetPath(modelId, filename), data, contentType);
  }

  async downloadGlobalAsset(modelId: string, filename: string): Promise<Buffer> {
    return this.base.downloadFile(this.globalAssetPath(modelId, filename));
  }

  async deleteGlobalAsset(modelId: string): Promise<void> {
    await this.base.deleteDirectory(this.globalAssetPath(modelId));
  }

  async listGlobalAssetFiles(modelId: string): Promise<string[]> {
    return this.base.listFiles(this.globalAssetPath(modelId));
  }

  // ── Texture Operations ────────────────────────────────────────────────────

  async uploadTexture(projectId: string, assetId: string, textureName: string, data: Buffer, contentType: string): Promise<string> {
    this.validateExtension(textureName);
    this.validateFileSize(data);
    return this.base.uploadFile(this.texturePath(projectId, assetId, textureName), data, contentType);
  }

  async downloadTexture(projectId: string, assetId: string, textureName: string): Promise<Buffer> {
    return this.base.downloadFile(this.texturePath(projectId, assetId, textureName));
  }

  async deleteTexture(projectId: string, assetId: string, textureName: string): Promise<void> {
    await this.base.deleteFile(this.texturePath(projectId, assetId, textureName));
  }

  // ── Facility Operations ───────────────────────────────────────────────────

  async saveFacilityManifest(projectId: string, facilityId: string, manifest: BluDesignFacility): Promise<void> {
    await this.base.uploadFile(
      `${this.facilityPrefix(projectId, facilityId)}/manifest.json`,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      'application/json',
    );
  }

  async loadFacilityManifest(projectId: string, facilityId: string): Promise<BluDesignFacility> {
    const buffer = await this.base.downloadFile(`${this.facilityPrefix(projectId, facilityId)}/manifest.json`);
    return JSON.parse(buffer.toString('utf-8')) as BluDesignFacility;
  }

  async deleteFacility(projectId: string, facilityId: string): Promise<void> {
    await this.base.deleteDirectory(this.facilityPrefix(projectId, facilityId));
  }

  async listFacilities(projectId: string): Promise<string[]> {
    // We need sub-folder names under projects/{projectId}/facilities/
    // The base listFiles returns file names, not folder names.
    // Use a helper that lists Drive folders via the base's internal folder resolution.
    try {
      // Resolve the facilities folder, then list its sub-folders
      const resolveFolder = (this.base as any).resolveFolderPath.bind(this.base);
      const listDriveFiles = (this.base as any).listDriveFiles.bind(this.base);
      const folderId = await resolveFolder(this.facilitiesDir(projectId));
      const items: Array<{ name: string; mimeType: string }> = await listDriveFiles(folderId);
      return items
        .filter(f => f.mimeType === 'application/vnd.google-apps.folder')
        .map(f => f.name); // FIX #7: return names not IDs
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return [];
      throw error;
    }
  }

  // ── Project Operations ────────────────────────────────────────────────────

  async initializeProject(projectId: string): Promise<void> {
    const metadata = { projectId, createdAt: new Date().toISOString(), version: '1.0' };
    await this.base.uploadFile(
      `${this.projectPath(projectId)}/project.json`,
      Buffer.from(JSON.stringify(metadata, null, 2)),
      'application/json',
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    // FIX #5: base.deleteDirectory deletes the folder (Drive cascades)
    await this.base.deleteDirectory(this.projectPath(projectId));
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    return this.base.getDirectorySize(this.projectPath(projectId));
  }

  // ── Export/Import ─────────────────────────────────────────────────────────

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    await this.addFolderToArchive(this.projectPath(projectId), '', archive);
    archive.finalize();
    return archive;
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const extract = unzipper.Parse();
    zipStream.pipe(extract);

    // FIX #14: collect entries and process sequentially to avoid folder-creation races
    const entries: Array<{ path: string; buffer: Buffer }> = [];

    extract.on('entry', (entry: any) => {
      if (entry.type === 'File') {
        const p = entry.path;
        entry.buffer().then((buf: Buffer) => entries.push({ path: p, buffer: buf }));
      } else {
        entry.autodrain();
      }
    });

    await new Promise<void>((resolve, reject) => {
      extract.on('end', resolve);
      extract.on('error', reject);
    });

    // Upload sequentially to avoid concurrent folder-creation duplicates
    for (const item of entries) {
      await this.base.uploadFile(`${this.projectPath(projectId)}/${item.path}`, item.buffer);
    }
  }

  async exportFacilityAsZip(projectId: string, facilityId: string, includeAssets: boolean): Promise<Readable> {
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Add facility files under "facility/" prefix
    await this.addFolderToArchive(this.facilityPrefix(projectId, facilityId), 'facility/', archive);

    if (includeAssets) {
      const manifest = await this.loadFacilityManifest(projectId, facilityId);
      for (const assetId of manifest.assetManifest) {
        await this.addFolderToArchive(
          this.assetPath(projectId, assetId),
          `assets/${assetId}/`,
          archive,
        );
      }
    }

    archive.finalize();
    return archive;
  }

  /** Recursively add files from a Drive folder into an archiver instance */
  private async addFolderToArchive(dirPath: string, prefix: string, archive: archiver.Archiver): Promise<void> {
    let folderId: string;
    try {
      const resolveFolder = (this.base as any).resolveFolderPath.bind(this.base);
      folderId = await resolveFolder(dirPath);
    } catch (error: any) {
      if (error instanceof StorageError && error.code === StorageErrorCode.NOT_FOUND) return;
      throw error;
    }

    const listDriveFiles = (this.base as any).listDriveFiles.bind(this.base);
    const getDriveFileContent = (this.base as any).getDriveFileContent.bind(this.base);
    const items: Array<{ id: string; name: string; mimeType: string }> = await listDriveFiles(folderId);

    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        await this.addFolderToArchive(`${dirPath}/${item.name}`, `${prefix}${item.name}/`, archive);
      } else {
        const buffer: Buffer = await getDriveFileContent(item.id);
        archive.append(buffer, { name: `${prefix}${item.name}` });
      }
    }
  }

  // ── URL Generation ────────────────────────────────────────────────────────

  async getSignedUrl(projectId: string, filePath: string, _expiresInSeconds: number): Promise<string> {
    // FIX #10: Walk the full path instead of only searching top-level
    const fullPath = `${this.projectPath(projectId)}/${filePath}`;
    const exists = await this.base.fileExists(fullPath);
    if (!exists) {
      throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
    }
    // Note: Drive API does not support true signed URLs.
    // The best we can do is return a webViewLink, but that requires
    // setting the file to public which is a security concern.
    // Return a placeholder indicating Drive doesn't support this.
    return `https://drive.google.com/file/not-directly-supported`;
  }

  getPublicUrl(_projectId: string, _filePath: string): string | null {
    return null;
  }
}
