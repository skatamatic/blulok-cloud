/**
 * Local Storage Provider (BluDesign Domain Layer)
 *
 * Thin domain adapter that delegates file I/O to LocalBaseStorage,
 * adding BluDesign-specific path conventions, validation, and zip operations.
 */

import * as path from 'path';
import { existsSync } from 'fs';
import { Readable } from 'stream';
import { promisify } from 'util';
import { pipeline } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {
  StorageProvider,
  StorageError,
  StorageErrorCode,
  LocalProviderConfig,
} from './storage-provider.interface';
import { LocalBaseStorage } from '@/services/storage/local-base.provider';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

const pipelineAsync = promisify(pipeline);

export class LocalStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.LOCAL;
  private base: LocalBaseStorage;
  private maxFileSizeMb: number;
  private allowedExtensions: string[];

  constructor(config: LocalProviderConfig) {
    this.base = new LocalBaseStorage(config);
    this.maxFileSizeMb = (config as any).maxFileSizeMb ?? 100;
    this.allowedExtensions = (config as any).allowedExtensions ?? [
      '.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp', '.json',
    ];
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.base.initialize();
  }

  async healthCheck(): Promise<boolean> {
    return this.base.healthCheck();
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

  // ── path helpers ──────────────────────────────────────────────────────────

  private assetPath(projectId: string, assetId: string, filename?: string): string {
    return filename
      ? `projects/${projectId}/assets/${assetId}/${filename}`
      : `projects/${projectId}/assets/${assetId}`;
  }

  private texturePath(projectId: string, assetId: string, textureName?: string): string {
    return textureName
      ? `projects/${projectId}/assets/${assetId}/textures/${textureName}`
      : `projects/${projectId}/assets/${assetId}/textures`;
  }

  private facilityPath(projectId: string, facilityId: string): string {
    return `projects/${projectId}/facilities/${facilityId}`;
  }

  private globalAssetPath(modelId: string, filename?: string): string {
    return filename ? `global/models/${modelId}/${filename}` : `global/models/${modelId}`;
  }

  private projectPath(projectId: string): string {
    return `projects/${projectId}`;
  }

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
    const fp = `${this.facilityPath(projectId, facilityId)}/manifest.json`;
    await this.base.uploadFile(fp, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
  }

  async loadFacilityManifest(projectId: string, facilityId: string): Promise<BluDesignFacility> {
    const fp = `${this.facilityPath(projectId, facilityId)}/manifest.json`;
    const buffer = await this.base.downloadFile(fp);
    return JSON.parse(buffer.toString('utf-8')) as BluDesignFacility;
  }

  async deleteFacility(projectId: string, facilityId: string): Promise<void> {
    await this.base.deleteDirectory(this.facilityPath(projectId, facilityId));
  }

  async listFacilities(projectId: string): Promise<string[]> {
    // List sub-directories under projects/{projectId}/facilities/
    // The base.listFiles only returns files, so we need to read the directory entries
    // We'll use a trick: list the facilities dir as if it's a prefix and filter for dirs
    // Since we're on local FS, we delegate to a manual approach via the base path
    const facilitiesDir = `${this.projectPath(projectId)}/facilities`;
    try {
      const fs = await import('fs/promises');
      const basePath = (this.base as any).basePath;
      const absDir = require('path').resolve(basePath, facilitiesDir);
      const entries = await fs.readdir(absDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  // ── Project Operations ────────────────────────────────────────────────────

  async initializeProject(projectId: string): Promise<void> {
    // Create project metadata
    const metadata = { projectId, createdAt: new Date().toISOString(), version: '1.0' };
    await this.base.uploadFile(
      `${this.projectPath(projectId)}/project.json`,
      Buffer.from(JSON.stringify(metadata, null, 2)),
      'application/json',
    );
    // Ensure asset and facility dirs exist by uploading/deleting a marker is overkill;
    // the dirs will be created lazily on first use.
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.base.deleteDirectory(this.projectPath(projectId));
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    return this.base.getDirectorySize(this.projectPath(projectId));
  }

  // ── Export/Import ─────────────────────────────────────────────────────────

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const basePath = (this.base as any).basePath;
    const projectDir = require('path').resolve(basePath, this.projectPath(projectId));
    if (!existsSync(projectDir)) {
      throw new StorageError(`Project not found: ${projectId}`, StorageErrorCode.NOT_FOUND);
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(projectDir, false);
    archive.finalize();
    return archive;
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const basePath = (this.base as any).basePath;
    const projectDir = require('path').resolve(basePath, this.projectPath(projectId));
    const fs = await import('fs/promises');
    await fs.mkdir(projectDir, { recursive: true });
    await pipelineAsync(zipStream, unzipper.Extract({ path: projectDir }));
  }

  async exportFacilityAsZip(projectId: string, facilityId: string, includeAssets: boolean): Promise<Readable> {
    const basePath = (this.base as any).basePath;
    const facilityDir = require('path').resolve(basePath, this.facilityPath(projectId, facilityId));
    if (!existsSync(facilityDir)) {
      throw new StorageError(`Facility not found: ${facilityId}`, StorageErrorCode.NOT_FOUND);
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(facilityDir, 'facility');

    if (includeAssets) {
      const manifest = await this.loadFacilityManifest(projectId, facilityId);
      for (const assetId of manifest.assetManifest) {
        const assetDir = require('path').resolve(basePath, this.assetPath(projectId, assetId));
        if (existsSync(assetDir)) {
          archive.directory(assetDir, `assets/${assetId}`);
        }
      }
    }

    archive.finalize();
    return archive;
  }

  // ── URL Generation ────────────────────────────────────────────────────────

  async getSignedUrl(projectId: string, filePath: string, _expiresInSeconds: number): Promise<string> {
    const exists = await this.base.fileExists(`${this.projectPath(projectId)}/${filePath}`);
    if (!exists) {
      throw new StorageError(`File not found: ${filePath}`, StorageErrorCode.NOT_FOUND);
    }
    const basePath = (this.base as any).basePath;
    const fullPath = require('path').resolve(basePath, this.projectPath(projectId), filePath);
    return `file://${fullPath}`;
  }

  getPublicUrl(_projectId: string, _filePath: string): string | null {
    return null;
  }
}
