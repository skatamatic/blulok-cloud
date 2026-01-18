/**
 * Google Cloud Storage Provider
 * 
 * GCS-based storage provider for BluDesign assets and facilities.
 * Stores files in Google Cloud Storage buckets.
 */

import { Storage, Bucket, File } from '@google-cloud/storage';
import { Readable } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { promisify } from 'util';
import { pipeline } from 'stream';
import {
  StorageProvider,
  GCSProviderConfig,
  StorageError,
  StorageErrorCode,
} from './storage-provider.interface';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

const pipelineAsync = promisify(pipeline);

export class GCSStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.GCS;
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  private publicBucket: boolean;

  constructor(config: GCSProviderConfig) {
    if (!config.bucketName) {
      throw new StorageError(
        'GCS bucket name is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }
    if (!config.projectId) {
      throw new StorageError(
        'GCS project ID is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }

    this.bucketName = config.bucketName;
    this.publicBucket = config.publicBucket ?? false;

    // Initialize Storage client
    const storageOptions: any = {
      projectId: config.projectId,
    };

    // Support key file path or key file contents
    if (config.keyFilePath) {
      storageOptions.keyFilename = config.keyFilePath;
    } else if (config.keyFileContents) {
      try {
        storageOptions.credentials = JSON.parse(config.keyFileContents);
      } catch (error) {
        throw new StorageError(
          'Invalid key file contents: must be valid JSON',
          StorageErrorCode.CONFIGURATION_ERROR
        );
      }
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async initialize(): Promise<void> {
    // Check if bucket exists and is accessible
    const [exists] = await this.bucket.exists();
    if (!exists) {
      throw new StorageError(
        `Bucket ${this.bucketName} does not exist or is not accessible`,
        StorageErrorCode.PERMISSION_DENIED
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const [exists] = await this.bucket.exists();
      if (!exists) {
        return false;
      }
      
      // Try to write and delete a test file
      const testFile = this.bucket.file('.healthcheck');
      await testFile.save('ok');
      await testFile.delete();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  private getAssetPath(projectId: string, assetId: string, filename: string): string {
    return `projects/${projectId}/assets/${assetId}/${filename}`;
  }

  private getTexturePath(projectId: string, assetId: string, textureName: string): string {
    return `projects/${projectId}/assets/${assetId}/textures/${textureName}`;
  }

  private getFacilityPath(projectId: string, facilityId: string): string {
    return `projects/${projectId}/facilities/${facilityId}`;
  }

  private getGlobalAssetPath(modelId: string, filename: string): string {
    return `global/models/${modelId}/${filename}`;
  }

  // ==========================================================================
  // Asset Operations
  // ==========================================================================

  async uploadAssetFile(
    projectId: string,
    assetId: string,
    filename: string,
    data: Buffer,
    contentType: string
  ): Promise<string> {
    const filePath = this.getAssetPath(projectId, assetId, filename);
    const file = this.bucket.file(filePath);

    await file.save(data, {
      metadata: {
        contentType,
        metadata: {
          projectId,
          assetId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    return filePath;
  }

  async downloadAssetFile(
    projectId: string,
    assetId: string,
    filename: string
  ): Promise<Buffer> {
    const filePath = this.getAssetPath(projectId, assetId, filename);
    const file = this.bucket.file(filePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(
          `Asset file not found: ${filename}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const [buffer] = await file.download();
      return buffer;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      if (error.code === 404) {
        throw new StorageError(
          `Asset file not found: ${filename}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to download file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async deleteAssetFiles(projectId: string, assetId: string): Promise<void> {
    const prefix = `projects/${projectId}/assets/${assetId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      await Promise.all(files.map(file => file.delete()));
    } catch (error: any) {
      throw new StorageError(
        `Failed to delete asset files: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async listAssetFiles(projectId: string, assetId: string): Promise<string[]> {
    const prefix = `projects/${projectId}/assets/${assetId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map(file => {
        const pathParts = file.name.split('/');
        return pathParts[pathParts.length - 1];
      });
    } catch (error: any) {
      throw new StorageError(
        `Failed to list asset files: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  // ==========================================================================
  // Global Asset Operations
  // ==========================================================================

  async uploadGlobalAsset(
    modelId: string,
    filename: string,
    data: Buffer,
    contentType: string
  ): Promise<string> {
    const filePath = this.getGlobalAssetPath(modelId, filename);
    const file = this.bucket.file(filePath);

    await file.save(data, {
      metadata: {
        contentType,
        metadata: {
          modelId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    return filePath;
  }

  async downloadGlobalAsset(
    modelId: string,
    filename: string
  ): Promise<Buffer> {
    const filePath = this.getGlobalAssetPath(modelId, filename);
    const file = this.bucket.file(filePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(
          `Global asset file not found: ${filename}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const [buffer] = await file.download();
      return buffer;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      if (error.code === 404) {
        throw new StorageError(
          `Global asset file not found: ${filename}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to download global asset: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async deleteGlobalAsset(modelId: string): Promise<void> {
    const prefix = `global/models/${modelId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      await Promise.all(files.map(file => file.delete()));
    } catch (error: any) {
      throw new StorageError(
        `Failed to delete global asset: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async listGlobalAssetFiles(modelId: string): Promise<string[]> {
    const prefix = `global/models/${modelId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map(file => {
        const pathParts = file.name.split('/');
        return pathParts[pathParts.length - 1];
      });
    } catch (error: any) {
      throw new StorageError(
        `Failed to list global asset files: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
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
    contentType: string
  ): Promise<string> {
    const filePath = this.getTexturePath(projectId, assetId, textureName);
    const file = this.bucket.file(filePath);

    await file.save(data, {
      metadata: {
        contentType,
        metadata: {
          projectId,
          assetId,
          textureName,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    return filePath;
  }

  async downloadTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<Buffer> {
    const filePath = this.getTexturePath(projectId, assetId, textureName);
    const file = this.bucket.file(filePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(
          `Texture not found: ${textureName}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const [buffer] = await file.download();
      return buffer;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      if (error.code === 404) {
        throw new StorageError(
          `Texture not found: ${textureName}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to download texture: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async deleteTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<void> {
    const filePath = this.getTexturePath(projectId, assetId, textureName);
    const file = this.bucket.file(filePath);

    try {
      await file.delete();
    } catch (error: any) {
      if (error.code !== 404) {
        throw new StorageError(
          `Failed to delete texture: ${error.message}`,
          StorageErrorCode.PROVIDER_ERROR,
          { originalError: error.message }
        );
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
    const filePath = `${this.getFacilityPath(projectId, facilityId)}/manifest.json`;
    const file = this.bucket.file(filePath);

    await file.save(JSON.stringify(manifest, null, 2), {
      metadata: {
        contentType: 'application/json',
        metadata: {
          projectId,
          facilityId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  async loadFacilityManifest(
    projectId: string,
    facilityId: string
  ): Promise<BluDesignFacility> {
    const filePath = `${this.getFacilityPath(projectId, facilityId)}/manifest.json`;
    const file = this.bucket.file(filePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(
          `Facility not found: ${facilityId}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const [buffer] = await file.download();
      return JSON.parse(buffer.toString('utf-8')) as BluDesignFacility;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      if (error.code === 404) {
        throw new StorageError(
          `Facility not found: ${facilityId}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      throw new StorageError(
        `Failed to load facility manifest: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async deleteFacility(projectId: string, facilityId: string): Promise<void> {
    const prefix = this.getFacilityPath(projectId, facilityId);
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      await Promise.all(files.map(file => file.delete()));
    } catch (error: any) {
      throw new StorageError(
        `Failed to delete facility: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async listFacilities(projectId: string): Promise<string[]> {
    const prefix = `projects/${projectId}/facilities/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix, delimiter: '/' });
      const facilityIds = new Set<string>();
      
      // Extract facility IDs from folder structure
      for (const file of files) {
        const pathParts = file.name.split('/');
        if (pathParts.length >= 4 && pathParts[2] === 'facilities') {
          facilityIds.add(pathParts[3]);
        }
      }
      
      return Array.from(facilityIds);
    } catch (error: any) {
      throw new StorageError(
        `Failed to list facilities: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  // ==========================================================================
  // Project Operations
  // ==========================================================================

  async initializeProject(projectId: string): Promise<void> {
    // Create project metadata file
    const metadata = {
      projectId,
      createdAt: new Date().toISOString(),
      version: '1.0',
    };
    
    const filePath = `projects/${projectId}/project.json`;
    const file = this.bucket.file(filePath);
    
    await file.save(JSON.stringify(metadata, null, 2), {
      metadata: {
        contentType: 'application/json',
      },
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const prefix = `projects/${projectId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      await Promise.all(files.map(file => file.delete()));
    } catch (error: any) {
      throw new StorageError(
        `Failed to delete project: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    const prefix = `projects/${projectId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      let totalSize = 0;
      
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        totalSize += parseInt(metadata.size || '0', 10);
      }
      
      return totalSize;
    } catch (error: any) {
      throw new StorageError(
        `Failed to calculate storage usage: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  // ==========================================================================
  // Export/Import Operations
  // ==========================================================================

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const prefix = `projects/${projectId}/`;
    
    try {
      const [files] = await this.bucket.getFiles({ prefix });
      
      if (files.length === 0) {
        throw new StorageError(
          `Project not found: ${projectId}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      
      // Add all files to archive
      for (const file of files) {
        const [buffer] = await file.download();
        const relativePath = file.name.replace(`${prefix}`, '');
        archive.append(buffer, { name: relativePath });
      }
      
      archive.finalize();
      return archive;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to export project: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const prefix = `projects/${projectId}/`;
    
    try {
      // Extract zip and upload files
      const extract = unzipper.Parse();
      zipStream.pipe(extract);

      const uploadPromises: Promise<void>[] = [];

      extract.on('entry', async (entry: any) => {
        const filePath = entry.path;
        if (entry.type === 'File') {
          const buffer = await entry.buffer();
          const gcsPath = `${prefix}${filePath}`;
          const file = this.bucket.file(gcsPath);
          
          uploadPromises.push(
            file.save(buffer, {
              metadata: {
                contentType: this.getContentType(filePath),
              },
            })
          );
        } else {
          entry.autodrain();
        }
      });

      await new Promise<void>((resolve, reject) => {
        extract.on('end', () => {
          Promise.all(uploadPromises)
            .then(() => resolve())
            .catch(reject);
        });
        extract.on('error', reject);
      });
    } catch (error: any) {
      throw new StorageError(
        `Failed to import project: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  async exportFacilityAsZip(
    projectId: string,
    facilityId: string,
    includeAssets: boolean
  ): Promise<Readable> {
    const facilityPrefix = this.getFacilityPath(projectId, facilityId);
    
    try {
      const [facilityFiles] = await this.bucket.getFiles({ prefix: facilityPrefix });
      
      if (facilityFiles.length === 0) {
        throw new StorageError(
          `Facility not found: ${facilityId}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      
      // Add facility files
      for (const file of facilityFiles) {
        const [buffer] = await file.download();
        const relativePath = file.name.replace(`${facilityPrefix}/`, 'facility/');
        archive.append(buffer, { name: relativePath });
      }

      // Optionally include referenced assets
      if (includeAssets) {
        const manifest = await this.loadFacilityManifest(projectId, facilityId);
        const assetPrefix = `projects/${projectId}/assets/`;
        
        for (const assetId of manifest.assetManifest) {
          const [assetFiles] = await this.bucket.getFiles({
            prefix: `${assetPrefix}${assetId}/`,
          });
          
          for (const file of assetFiles) {
            const [buffer] = await file.download();
            const relativePath = file.name.replace(`${assetPrefix}`, 'assets/');
            archive.append(buffer, { name: relativePath });
          }
        }
      }

      archive.finalize();
      return archive;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to export facility: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  // ==========================================================================
  // URL Generation
  // ==========================================================================

  async getSignedUrl(
    projectId: string,
    filePath: string,
    expiresInSeconds: number
  ): Promise<string> {
    const fullPath = `projects/${projectId}/${filePath}`;
    const file = this.bucket.file(fullPath);
    
    try {
      const [exists] = await file.exists();
      if (!exists) {
        throw new StorageError(
          `File not found: ${filePath}`,
          StorageErrorCode.NOT_FOUND
        );
      }

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
      
      return url;
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to generate signed URL: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  getPublicUrl(projectId: string, filePath: string): string | null {
    if (!this.publicBucket) {
      return null;
    }
    
    const fullPath = `projects/${projectId}/${filePath}`;
    return `https://storage.googleapis.com/${this.bucketName}/${fullPath}`;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      json: 'application/json',
      glb: 'model/gltf-binary',
      gltf: 'model/gltf+json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }
}
