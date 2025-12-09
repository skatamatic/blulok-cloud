/**
 * Local Storage Provider
 * 
 * File-based storage provider for BluDesign assets and facilities.
 * Stores files in the local filesystem.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {
  StorageProvider,
  LocalProviderConfig,
  StorageError,
  StorageErrorCode,
} from './storage-provider.interface';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

const pipelineAsync = promisify(pipeline);

export class LocalStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.LOCAL;
  private basePath: string;
  private maxFileSizeMb: number;
  private allowedExtensions: string[];

  constructor(config: LocalProviderConfig) {
    this.basePath = config.basePath;
    this.maxFileSizeMb = config.maxFileSizeMb ?? 100;
    this.allowedExtensions = config.allowedExtensions ?? [
      '.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp', '.json'
    ];
  }

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

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  private getProjectPath(projectId: string): string {
    return path.join(this.basePath, 'projects', projectId);
  }

  private getAssetPath(projectId: string, assetId: string): string {
    return path.join(this.getProjectPath(projectId), 'assets', assetId);
  }

  private getFacilityPath(projectId: string, facilityId: string): string {
    return path.join(this.getProjectPath(projectId), 'facilities', facilityId);
  }

  private getTexturePath(projectId: string, assetId: string): string {
    return path.join(this.getAssetPath(projectId, assetId), 'textures');
  }

  private validateExtension(filename: string): void {
    const ext = path.extname(filename).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new StorageError(
        `File extension ${ext} not allowed`,
        StorageErrorCode.INVALID_FILE,
        { allowedExtensions: this.allowedExtensions }
      );
    }
  }

  private validateFileSize(data: Buffer): void {
    const sizeMb = data.length / (1024 * 1024);
    if (sizeMb > this.maxFileSizeMb) {
      throw new StorageError(
        `File size ${sizeMb.toFixed(2)}MB exceeds maximum ${this.maxFileSizeMb}MB`,
        StorageErrorCode.QUOTA_EXCEEDED
      );
    }
  }

  // ==========================================================================
  // Asset Operations
  // ==========================================================================

  async uploadAssetFile(
    projectId: string,
    assetId: string,
    filename: string,
    data: Buffer,
    _contentType: string
  ): Promise<string> {
    this.validateExtension(filename);
    this.validateFileSize(data);

    const assetPath = this.getAssetPath(projectId, assetId);
    await fs.mkdir(assetPath, { recursive: true });

    const filePath = path.join(assetPath, filename);
    await fs.writeFile(filePath, data);

    return filePath;
  }

  async downloadAssetFile(
    projectId: string,
    assetId: string,
    filename: string
  ): Promise<Buffer> {
    const filePath = path.join(this.getAssetPath(projectId, assetId), filename);

    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new StorageError(
          `Asset file not found: ${filename}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw err;
    }
  }

  async deleteAssetFiles(projectId: string, assetId: string): Promise<void> {
    const assetPath = this.getAssetPath(projectId, assetId);
    
    try {
      await fs.rm(assetPath, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async listAssetFiles(projectId: string, assetId: string): Promise<string[]> {
    const assetPath = this.getAssetPath(projectId, assetId);

    try {
      const entries = await fs.readdir(assetPath, { withFileTypes: true });
      return entries
        .filter(e => e.isFile())
        .map(e => e.name);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  // ==========================================================================
  // Texture Operations
  // ==========================================================================

  async uploadTexture(
    projectId: string,
    assetId: string,
    textureName: string,
    data: Buffer,
    _contentType: string
  ): Promise<string> {
    this.validateExtension(textureName);
    this.validateFileSize(data);

    const texturePath = this.getTexturePath(projectId, assetId);
    await fs.mkdir(texturePath, { recursive: true });

    const filePath = path.join(texturePath, textureName);
    await fs.writeFile(filePath, data);

    return filePath;
  }

  async downloadTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<Buffer> {
    const filePath = path.join(this.getTexturePath(projectId, assetId), textureName);

    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new StorageError(
          `Texture not found: ${textureName}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw err;
    }
  }

  async deleteTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<void> {
    const filePath = path.join(this.getTexturePath(projectId, assetId), textureName);

    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  // ==========================================================================
  // Facility Operations
  // ==========================================================================

  async saveFacilityManifest(
    projectId: string,
    facilityId: string,
    manifest: BluDesignFacility
  ): Promise<void> {
    const facilityPath = this.getFacilityPath(projectId, facilityId);
    await fs.mkdir(facilityPath, { recursive: true });

    const manifestPath = path.join(facilityPath, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  async loadFacilityManifest(
    projectId: string,
    facilityId: string
  ): Promise<BluDesignFacility> {
    const manifestPath = path.join(
      this.getFacilityPath(projectId, facilityId),
      'manifest.json'
    );

    try {
      const data = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(data) as BluDesignFacility;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new StorageError(
          `Facility not found: ${facilityId}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw err;
    }
  }

  async deleteFacility(projectId: string, facilityId: string): Promise<void> {
    const facilityPath = this.getFacilityPath(projectId, facilityId);

    try {
      await fs.rm(facilityPath, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async listFacilities(projectId: string): Promise<string[]> {
    const facilitiesPath = path.join(this.getProjectPath(projectId), 'facilities');

    try {
      const entries = await fs.readdir(facilitiesPath, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  // ==========================================================================
  // Project Operations
  // ==========================================================================

  async initializeProject(projectId: string): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    await fs.mkdir(path.join(projectPath, 'assets'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'facilities'), { recursive: true });
    
    // Create project metadata file
    const metadata = {
      projectId,
      createdAt: new Date().toISOString(),
      version: '1.0',
    };
    await fs.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(metadata, null, 2)
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    const projectPath = this.getProjectPath(projectId);

    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    const projectPath = this.getProjectPath(projectId);
    return this.calculateDirectorySize(projectPath);
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    return totalSize;
  }

  // ==========================================================================
  // Export/Import Operations
  // ==========================================================================

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const projectPath = this.getProjectPath(projectId);

    if (!existsSync(projectPath)) {
      throw new StorageError(
        `Project not found: ${projectId}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(projectPath, false);
    archive.finalize();

    return archive;
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    await fs.mkdir(projectPath, { recursive: true });

    await pipelineAsync(
      zipStream,
      unzipper.Extract({ path: projectPath })
    );
  }

  async exportFacilityAsZip(
    projectId: string,
    facilityId: string,
    includeAssets: boolean
  ): Promise<Readable> {
    const facilityPath = this.getFacilityPath(projectId, facilityId);

    if (!existsSync(facilityPath)) {
      throw new StorageError(
        `Facility not found: ${facilityId}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Add facility manifest
    archive.directory(facilityPath, 'facility');

    // Optionally include referenced assets
    if (includeAssets) {
      const manifest = await this.loadFacilityManifest(projectId, facilityId);
      
      for (const assetId of manifest.assetManifest) {
        const assetPath = this.getAssetPath(projectId, assetId);
        if (existsSync(assetPath)) {
          archive.directory(assetPath, `assets/${assetId}`);
        }
      }
    }

    archive.finalize();
    return archive;
  }

  // ==========================================================================
  // URL Generation
  // ==========================================================================

  async getSignedUrl(
    projectId: string,
    filePath: string,
    _expiresInSeconds: number
  ): Promise<string> {
    // For local storage, we just return the file path
    // In a real app, you'd generate a temporary token-based URL
    const fullPath = path.join(this.getProjectPath(projectId), filePath);
    
    if (!existsSync(fullPath)) {
      throw new StorageError(
        `File not found: ${filePath}`,
        StorageErrorCode.NOT_FOUND
      );
    }
    
    // Return a file:// URL for local development
    return `file://${fullPath}`;
  }

  getPublicUrl(projectId: string, filePath: string): string | null {
    // Local storage doesn't have public URLs
    return null;
  }
}

