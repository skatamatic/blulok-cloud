/**
 * GCS Storage Provider (BluDesign Domain Layer)
 *
 * Thin domain adapter that delegates file I/O to GCSBaseStorage,
 * adding BluDesign-specific path conventions, metadata, and zip operations.
 */

import * as pathLib from 'path';
import { Readable } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {
  StorageProvider,
  StorageError,
  StorageErrorCode,
  GCSProviderConfig,
} from './storage-provider.interface';
import { GCSBaseStorage } from '@/services/storage/gcs-base.provider';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

export class GCSStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.GCS;
  private base: GCSBaseStorage;
  private publicBucket: boolean;
  private bucketName: string;
  private maxFileSizeMb: number;
  private allowedExtensions: string[];

  constructor(config: GCSProviderConfig & { publicBucket?: boolean; maxFileSizeMb?: number; allowedExtensions?: string[] }) {
    this.base = new GCSBaseStorage(config);
    this.publicBucket = config.publicBucket ?? false;
    this.bucketName = config.bucketName;
    this.maxFileSizeMb = config.maxFileSizeMb ?? 100;
    this.allowedExtensions = config.allowedExtensions ?? [
      '.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp', '.json',
    ];
  }

  // ── validation ────────────────────────────────────────────────────────────

  private validateExtension(filename: string): void {
    const ext = pathLib.extname(filename).toLowerCase();
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
  private facilityPrefix(projectId: string, facilityId: string): string {
    return `projects/${projectId}/facilities/${facilityId}`;
  }
  private globalAssetPath(modelId: string, filename?: string): string {
    return filename ? `global/models/${modelId}/${filename}` : `global/models/${modelId}`;
  }
  private projectPrefix(projectId: string): string { return `projects/${projectId}`; }

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
    // GCS uses flat object keys; facilities are inferred from key prefixes
    const prefix = `projects/${projectId}/facilities/`;
    const files = await this.base.listFiles(prefix.slice(0, -1)); // list at facilities dir
    // We need to extract unique facilityIds from sub-paths. Use a different approach:
    // List everything under the prefix and extract unique 4th segment.
    // Unfortunately base.listFiles only returns direct children names.
    // For GCS we need to peek inside the bucket directly.
    // Workaround: access the underlying bucket via the base instance.
    try {
      const bucket = (this.base as any).bucket;
      const [allFiles] = await bucket.getFiles({ prefix, delimiter: '/' });
      const ids = new Set<string>();
      for (const f of allFiles) {
        const parts = f.name.split('/');
        if (parts.length >= 4 && parts[2] === 'facilities') {
          ids.add(parts[3]);
        }
      }
      return Array.from(ids);
    } catch {
      return [];
    }
  }

  // ── Project Operations ────────────────────────────────────────────────────

  async initializeProject(projectId: string): Promise<void> {
    const metadata = { projectId, createdAt: new Date().toISOString(), version: '1.0' };
    await this.base.uploadFile(
      `${this.projectPrefix(projectId)}/project.json`,
      Buffer.from(JSON.stringify(metadata, null, 2)),
      'application/json',
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.base.deleteDirectory(this.projectPrefix(projectId));
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    return this.base.getDirectorySize(this.projectPrefix(projectId));
  }

  // ── Export/Import ─────────────────────────────────────────────────────────

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const prefix = `${this.projectPrefix(projectId)}/`;
    const bucket = (this.base as any).bucket;
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      throw new StorageError(`Project not found: ${projectId}`, StorageErrorCode.NOT_FOUND);
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    for (const file of files) {
      const [buffer] = await file.download();
      const relativePath = file.name.replace(prefix, '');
      archive.append(buffer, { name: relativePath });
    }
    archive.finalize();
    return archive;
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const prefix = `${this.projectPrefix(projectId)}/`;
    const extract = unzipper.Parse();
    zipStream.pipe(extract);

    const uploadPromises: Promise<void>[] = [];

    extract.on('entry', (entry: any) => {
      const filePath = entry.path;
      if (entry.type === 'File') {
        const p = entry.buffer().then((buffer: Buffer) =>
          this.base.uploadFile(`${prefix}${filePath}`, buffer),
        ).then(() => {});
        uploadPromises.push(p);
      } else {
        entry.autodrain();
      }
    });

    await new Promise<void>((resolve, reject) => {
      extract.on('end', () => Promise.all(uploadPromises).then(() => resolve()).catch(reject));
      extract.on('error', reject);
    });
  }

  async exportFacilityAsZip(projectId: string, facilityId: string, includeAssets: boolean): Promise<Readable> {
    const facilityPfx = `${this.facilityPrefix(projectId, facilityId)}/`;
    const bucket = (this.base as any).bucket;
    const [facilityFiles] = await bucket.getFiles({ prefix: facilityPfx });

    if (facilityFiles.length === 0) {
      throw new StorageError(`Facility not found: ${facilityId}`, StorageErrorCode.NOT_FOUND);
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    for (const file of facilityFiles) {
      const [buffer] = await file.download();
      archive.append(buffer, { name: file.name.replace(facilityPfx, 'facility/') });
    }

    if (includeAssets) {
      const manifest = await this.loadFacilityManifest(projectId, facilityId);
      for (const assetId of manifest.assetManifest) {
        const assetPfx = `${this.assetPath(projectId, assetId)}/`;
        const [assetFiles] = await bucket.getFiles({ prefix: assetPfx });
        for (const file of assetFiles) {
          const [buffer] = await file.download();
          archive.append(buffer, { name: file.name.replace(`projects/${projectId}/assets/`, 'assets/') });
        }
      }
    }

    archive.finalize();
    return archive;
  }

  // ── URL Generation ────────────────────────────────────────────────────────

  async getSignedUrl(projectId: string, filePath: string, expiresInSeconds: number): Promise<string> {
    const fullPath = `${this.projectPrefix(projectId)}/${filePath}`;
    const exists = await this.base.fileExists(fullPath);
    if (!exists) {
      throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
    }

    const bucket = (this.base as any).bucket;
    const file = bucket.file(fullPath);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }

  getPublicUrl(projectId: string, filePath: string): string | null {
    if (!this.publicBucket) return null;
    return `https://storage.googleapis.com/${this.bucketName}/${this.projectPrefix(projectId)}/${filePath}`;
  }
}
