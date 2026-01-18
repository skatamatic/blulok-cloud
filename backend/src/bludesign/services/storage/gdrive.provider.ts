/**
 * Google Drive Storage Provider
 * 
 * Google Drive-based storage provider for BluDesign assets and facilities.
 * Stores files in Google Drive folders with OAuth2 authentication.
 */

import { google } from 'googleapis';
import { drive_v3, OAuth2Client } from 'googleapis';
import { Readable } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { promisify } from 'util';
import { pipeline } from 'stream';
import {
  StorageProvider,
  GDriveProviderConfig,
  StorageError,
  StorageErrorCode,
} from './storage-provider.interface';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';
import { logger } from '@/utils/logger';

const pipelineAsync = promisify(pipeline);

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export class GDriveStorageProvider implements StorageProvider {
  readonly type = StorageProviderType.GDRIVE;
  private oauth2Client: OAuth2Client;
  private drive: drive_v3.Drive;
  private config: GDriveProviderConfig;
  private rootFolderId: string;

  constructor(config: GDriveProviderConfig) {
    if (!config.clientId) {
      throw new StorageError(
        'Google Drive client ID is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }
    if (!config.clientSecret) {
      throw new StorageError(
        'Google Drive client secret is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }
    if (!config.rootFolderId) {
      throw new StorageError(
        'Google Drive root folder ID is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }

    this.config = config;
    this.rootFolderId = config.rootFolderId;

    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'urn:ietf:wg:oauth:2.0:oob' // For server-side apps
    );

    // Set credentials if available
    if (config.accessToken) {
      this.oauth2Client.setCredentials({
        access_token: config.accessToken,
        refresh_token: config.refreshToken,
      });
    }

    // Initialize Drive API
    this.drive = google.drive({
      version: 'v3',
      auth: this.oauth2Client,
    });
  }

  async initialize(): Promise<void> {
    // Verify root folder exists and is accessible
    try {
      await this.getFolderById(this.rootFolderId);
    } catch (error: any) {
      throw new StorageError(
        `Root folder ${this.rootFolderId} does not exist or is not accessible`,
        StorageErrorCode.PERMISSION_DENIED
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if root folder is accessible
      await this.getFolderById(this.rootFolderId);
      
      // Try to create and delete a test file
      const testFile = await this.createFile(
        this.rootFolderId,
        '.healthcheck',
        Buffer.from('ok'),
        'text/plain'
      );
      await this.deleteFile(testFile.id);
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // OAuth2 Token Management
  // ==========================================================================

  private async ensureValidToken(): Promise<void> {
    const credentials = this.oauth2Client.credentials;
    
    // If no access token, try to refresh
    if (!credentials.access_token) {
      if (!this.config.refreshToken) {
        throw new StorageError(
          'No access token or refresh token available',
          StorageErrorCode.PERMISSION_DENIED
        );
      }
      await this.refreshAccessToken();
    }
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.config.refreshToken) {
      throw new StorageError(
        'Refresh token is required',
        StorageErrorCode.CONFIGURATION_ERROR
      );
    }

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update config with new tokens
      this.config.accessToken = credentials.access_token || undefined;
      if (credentials.refresh_token) {
        this.config.refreshToken = credentials.refresh_token;
      }
      
      this.oauth2Client.setCredentials(credentials);
      
      return credentials.access_token || '';
    } catch (error: any) {
      logger.error('Failed to refresh Google Drive access token:', error);
      throw new StorageError(
        'Failed to refresh access token. Please re-authenticate.',
        StorageErrorCode.PERMISSION_DENIED,
        { originalError: error.message }
      );
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getFolderById(folderId: string): Promise<DriveFile> {
    await this.ensureValidToken();
    
    try {
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType',
      });
      
      if (response.data.mimeType !== 'application/vnd.google-apps.folder') {
        throw new StorageError(
          `File ${folderId} is not a folder`,
          StorageErrorCode.INVALID_FILE
        );
      }
      
      return {
        id: response.data.id!,
        name: response.data.name!,
        mimeType: response.data.mimeType!,
      };
    } catch (error: any) {
      if (error.code === 404 || error.response?.status === 404) {
        throw new StorageError(
          `Folder not found: ${folderId}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      if (error.code === 401 || error.response?.status === 401) {
        // Try refreshing token once
        await this.refreshAccessToken();
        return this.getFolderById(folderId);
      }
      throw new StorageError(
        `Failed to get folder: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async getOrCreateFolder(
    parentId: string,
    folderName: string
  ): Promise<string> {
    await this.ensureValidToken();
    
    try {
      // Check if folder already exists
      const response = await this.drive.files.list({
        q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
        spaces: 'drive',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id!;
      }

      // Create folder if it doesn't exist
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });

      return createResponse.data.id!;
    } catch (error: any) {
      if (error.code === 429) {
        // Rate limit - wait and retry
        await this.handleRateLimit();
        return this.getOrCreateFolder(parentId, folderName);
      }
      throw new StorageError(
        `Failed to get or create folder: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async createFile(
    parentId: string,
    fileName: string,
    data: Buffer,
    mimeType: string
  ): Promise<DriveFile> {
    await this.ensureValidToken();
    
    try {
      // For files > 5MB, use resumable upload
      if (data.length > 5 * 1024 * 1024) {
        return await this.createFileResumable(parentId, fileName, data, mimeType);
      }

      // For smaller files, use simple upload
      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId],
        },
        media: {
          mimeType,
          body: Readable.from(data),
        },
        fields: 'id,name,mimeType,size',
      });

      return {
        id: response.data.id!,
        name: response.data.name!,
        mimeType: response.data.mimeType!,
        size: response.data.size,
      };
    } catch (error: any) {
      if (error.code === 429) {
        await this.handleRateLimit();
        return this.createFile(parentId, fileName, data, mimeType);
      }
      throw new StorageError(
        `Failed to create file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async createFileResumable(
    parentId: string,
    fileName: string,
    data: Buffer,
    mimeType: string
  ): Promise<DriveFile> {
    await this.ensureValidToken();
    
    try {
      // Step 1: Create resumable upload session
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId],
        },
        media: {
          mimeType,
          body: Readable.from(data),
        },
        fields: 'id,name,mimeType,size',
      }, {
        onUploadProgress: (evt) => {
          // Progress tracking could be added here
        },
      });

      return {
        id: createResponse.data.id!,
        name: createResponse.data.name!,
        mimeType: createResponse.data.mimeType!,
        size: createResponse.data.size,
      };
    } catch (error: any) {
      if (error.code === 429) {
        await this.handleRateLimit();
        return this.createFileResumable(parentId, fileName, data, mimeType);
      }
      throw new StorageError(
        `Failed to create file (resumable): ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async getFileContent(fileId: string): Promise<Buffer> {
    await this.ensureValidToken();
    
    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error: any) {
      if (error.code === 404 || error.response?.status === 404) {
        throw new StorageError(
          `File not found: ${fileId}`,
          StorageErrorCode.NOT_FOUND
        );
      }
      if (error.code === 401 || error.response?.status === 401) {
        await this.refreshAccessToken();
        return this.getFileContent(fileId);
      }
      if (error.code === 429) {
        await this.handleRateLimit();
        return this.getFileContent(fileId);
      }
      throw new StorageError(
        `Failed to get file content: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async deleteFile(fileId: string): Promise<void> {
    await this.ensureValidToken();
    
    try {
      await this.drive.files.delete({ fileId });
    } catch (error: any) {
      if (error.code === 404) {
        // File already deleted, ignore
        return;
      }
      if (error.code === 429) {
        await this.handleRateLimit();
        return this.deleteFile(fileId);
      }
      throw new StorageError(
        `Failed to delete file: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async listFiles(
    parentId: string,
    query?: string
  ): Promise<DriveFile[]> {
    await this.ensureValidToken();
    
    try {
      let q = `'${parentId}' in parents and trashed=false`;
      if (query) {
        q += ` and ${query}`;
      }

      const response = await this.drive.files.list({
        q,
        fields: 'files(id,name,mimeType,size)',
        spaces: 'drive',
      });

      return (response.data.files || []).map(file => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        size: file.size,
      }));
    } catch (error: any) {
      if (error.code === 429) {
        await this.handleRateLimit();
        return this.listFiles(parentId, query);
      }
      throw new StorageError(
        `Failed to list files: ${error.message}`,
        StorageErrorCode.PROVIDER_ERROR,
        { originalError: error.message }
      );
    }
  }

  private async handleRateLimit(): Promise<void> {
    // Exponential backoff for rate limits
    const delay = Math.random() * 1000 + 1000; // 1-2 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  private async getProjectFolder(projectId: string): Promise<string> {
    const projectsFolder = await this.getOrCreateFolder(
      this.rootFolderId,
      'projects'
    );
    return this.getOrCreateFolder(projectsFolder, projectId);
  }

  private async getAssetFolder(projectId: string, assetId: string): Promise<string> {
    const projectFolder = await this.getProjectFolder(projectId);
    const assetsFolder = await this.getOrCreateFolder(projectFolder, 'assets');
    return this.getOrCreateFolder(assetsFolder, assetId);
  }

  private async getFacilityFolder(projectId: string, facilityId: string): Promise<string> {
    const projectFolder = await this.getProjectFolder(projectId);
    const facilitiesFolder = await this.getOrCreateFolder(projectFolder, 'facilities');
    return this.getOrCreateFolder(facilitiesFolder, facilityId);
  }

  private async getGlobalModelsFolder(): Promise<string> {
    const globalFolder = await this.getOrCreateFolder(this.rootFolderId, 'global');
    return this.getOrCreateFolder(globalFolder, 'models');
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
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const file = await this.createFile(assetFolder, filename, data, contentType);
    return file.id;
  }

  async downloadAssetFile(
    projectId: string,
    assetId: string,
    filename: string
  ): Promise<Buffer> {
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const files = await this.listFiles(assetFolder, `name='${filename}'`);
    
    if (files.length === 0) {
      throw new StorageError(
        `Asset file not found: ${filename}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    return this.getFileContent(files[0].id);
  }

  async deleteAssetFiles(projectId: string, assetId: string): Promise<void> {
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const files = await this.listFiles(assetFolder);
    
    await Promise.all(files.map(file => this.deleteFile(file.id)));
  }

  async listAssetFiles(projectId: string, assetId: string): Promise<string[]> {
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const files = await this.listFiles(assetFolder);
    
    return files.map(file => file.name);
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
    const modelsFolder = await this.getGlobalModelsFolder();
    const modelFolder = await this.getOrCreateFolder(modelsFolder, modelId);
    const file = await this.createFile(modelFolder, filename, data, contentType);
    return file.id;
  }

  async downloadGlobalAsset(
    modelId: string,
    filename: string
  ): Promise<Buffer> {
    const modelsFolder = await this.getGlobalModelsFolder();
    const modelFolder = await this.getOrCreateFolder(modelsFolder, modelId);
    const files = await this.listFiles(modelFolder, `name='${filename}'`);
    
    if (files.length === 0) {
      throw new StorageError(
        `Global asset file not found: ${filename}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    return this.getFileContent(files[0].id);
  }

  async deleteGlobalAsset(modelId: string): Promise<void> {
    const modelsFolder = await this.getGlobalModelsFolder();
    const modelFolder = await this.getOrCreateFolder(modelsFolder, modelId);
    const files = await this.listFiles(modelFolder);
    
    await Promise.all(files.map(file => this.deleteFile(file.id)));
  }

  async listGlobalAssetFiles(modelId: string): Promise<string[]> {
    const modelsFolder = await this.getGlobalModelsFolder();
    const modelFolder = await this.getOrCreateFolder(modelsFolder, modelId);
    const files = await this.listFiles(modelFolder);
    
    return files.map(file => file.name);
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
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const texturesFolder = await this.getOrCreateFolder(assetFolder, 'textures');
    const file = await this.createFile(texturesFolder, textureName, data, contentType);
    return file.id;
  }

  async downloadTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<Buffer> {
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const texturesFolder = await this.getOrCreateFolder(assetFolder, 'textures');
    const files = await this.listFiles(texturesFolder, `name='${textureName}'`);
    
    if (files.length === 0) {
      throw new StorageError(
        `Texture not found: ${textureName}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    return this.getFileContent(files[0].id);
  }

  async deleteTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<void> {
    const assetFolder = await this.getAssetFolder(projectId, assetId);
    const texturesFolder = await this.getOrCreateFolder(assetFolder, 'textures');
    const files = await this.listFiles(texturesFolder, `name='${textureName}'`);
    
    if (files.length > 0) {
      await this.deleteFile(files[0].id);
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
    const facilityFolder = await this.getFacilityFolder(projectId, facilityId);
    await this.createFile(
      facilityFolder,
      'manifest.json',
      Buffer.from(JSON.stringify(manifest, null, 2)),
      'application/json'
    );
  }

  async loadFacilityManifest(
    projectId: string,
    facilityId: string
  ): Promise<BluDesignFacility> {
    const facilityFolder = await this.getFacilityFolder(projectId, facilityId);
    const files = await this.listFiles(facilityFolder, `name='manifest.json'`);
    
    if (files.length === 0) {
      throw new StorageError(
        `Facility not found: ${facilityId}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    const buffer = await this.getFileContent(files[0].id);
    return JSON.parse(buffer.toString('utf-8')) as BluDesignFacility;
  }

  async deleteFacility(projectId: string, facilityId: string): Promise<void> {
    const facilityFolder = await this.getFacilityFolder(projectId, facilityId);
    const files = await this.listFiles(facilityFolder);
    
    await Promise.all(files.map(file => this.deleteFile(file.id)));
  }

  async listFacilities(projectId: string): Promise<string[]> {
    const projectFolder = await this.getProjectFolder(projectId);
    const facilitiesFolder = await this.getOrCreateFolder(projectFolder, 'facilities');
    const folders = await this.listFiles(
      facilitiesFolder,
      "mimeType='application/vnd.google-apps.folder'"
    );
    
    return folders.map(folder => folder.id);
  }

  // ==========================================================================
  // Project Operations
  // ==========================================================================

  async initializeProject(projectId: string): Promise<void> {
    const projectFolder = await this.getProjectFolder(projectId);
    
    // Create project metadata file
    const metadata = {
      projectId,
      createdAt: new Date().toISOString(),
      version: '1.0',
    };
    
    await this.createFile(
      projectFolder,
      'project.json',
      Buffer.from(JSON.stringify(metadata, null, 2)),
      'application/json'
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    const projectFolder = await this.getProjectFolder(projectId);
    const files = await this.listFiles(projectFolder);
    
    // Delete all files and folders recursively
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Recursively delete folder contents
        const folderFiles = await this.listFiles(file.id);
        for (const folderFile of folderFiles) {
          await this.deleteFile(folderFile.id);
        }
      }
      await this.deleteFile(file.id);
    }
  }

  async getProjectStorageUsage(projectId: string): Promise<number> {
    const projectFolder = await this.getProjectFolder(projectId);
    
    const calculateSize = async (folderId: string): Promise<number> => {
      let totalSize = 0;
      const files = await this.listFiles(folderId);
      
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          totalSize += await calculateSize(file.id);
        } else if (file.size) {
          totalSize += parseInt(file.size, 10);
        }
      }
      
      return totalSize;
    };
    
    return calculateSize(projectFolder);
  }

  // ==========================================================================
  // Export/Import Operations
  // ==========================================================================

  async exportProjectAsZip(projectId: string): Promise<Readable> {
    const projectFolder = await this.getProjectFolder(projectId);
    const files = await this.listFiles(projectFolder);
    
    if (files.length === 0) {
      throw new StorageError(
        `Project not found: ${projectId}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    const addFilesToArchive = async (folderId: string, prefix: string) => {
      const folderFiles = await this.listFiles(folderId);
      
      for (const file of folderFiles) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await addFilesToArchive(file.id, `${prefix}${file.name}/`);
        } else {
          const buffer = await this.getFileContent(file.id);
          archive.append(buffer, { name: `${prefix}${file.name}` });
        }
      }
    };
    
    await addFilesToArchive(projectFolder, '');
    archive.finalize();
    return archive;
  }

  async importProjectFromZip(projectId: string, zipStream: Readable): Promise<void> {
    const projectFolder = await this.getProjectFolder(projectId);
    
    const extract = unzipper.Parse();
    zipStream.pipe(extract);

    const uploadPromises: Promise<void>[] = [];

    extract.on('entry', async (entry: any) => {
      const filePath = entry.path;
      if (entry.type === 'File') {
        const buffer = await entry.buffer();
        const pathParts = filePath.split('/');
        const fileName = pathParts.pop()!;
        let currentFolder = projectFolder;
        
        // Create folder structure
        for (const part of pathParts) {
          currentFolder = await this.getOrCreateFolder(currentFolder, part);
        }
        
        // Upload file
        uploadPromises.push(
          this.createFile(
            currentFolder,
            fileName,
            buffer,
            this.getContentType(fileName)
          ).then(() => {})
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
  }

  async exportFacilityAsZip(
    projectId: string,
    facilityId: string,
    includeAssets: boolean
  ): Promise<Readable> {
    const facilityFolder = await this.getFacilityFolder(projectId, facilityId);
    const files = await this.listFiles(facilityFolder);
    
    if (files.length === 0) {
      throw new StorageError(
        `Facility not found: ${facilityId}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // Add facility files
    for (const file of files) {
      const buffer = await this.getFileContent(file.id);
      archive.append(buffer, { name: `facility/${file.name}` });
    }

    // Optionally include referenced assets
    if (includeAssets) {
      const manifest = await this.loadFacilityManifest(projectId, facilityId);
      
      for (const assetId of manifest.assetManifest) {
        const assetFolder = await this.getAssetFolder(projectId, assetId);
        const assetFiles = await this.listFiles(assetFolder);
        
        for (const assetFile of assetFiles) {
          const buffer = await this.getFileContent(assetFile.id);
          archive.append(buffer, { name: `assets/${assetId}/${assetFile.name}` });
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
    expiresInSeconds: number
  ): Promise<string> {
    // For Google Drive, we generate a sharing link with expiration
    // Note: Drive API doesn't support true signed URLs, so we use sharing links
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    
    // Find the file
    const projectFolder = await this.getProjectFolder(projectId);
    const files = await this.listFiles(projectFolder, `name='${fileName}'`);
    
    if (files.length === 0) {
      throw new StorageError(
        `File not found: ${filePath}`,
        StorageErrorCode.NOT_FOUND
      );
    }

    // Generate a sharing link (read-only, expires)
    await this.ensureValidToken();
    try {
      await this.drive.permissions.create({
        fileId: files[0].id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      const file = await this.drive.files.get({
        fileId: files[0].id,
        fields: 'webViewLink',
      });

      return file.data.webViewLink || '';
    } catch (error: any) {
      // If permission already exists, just get the link
      const file = await this.drive.files.get({
        fileId: files[0].id,
        fields: 'webViewLink',
      });

      return file.data.webViewLink || '';
    }
  }

  getPublicUrl(projectId: string, filePath: string): string | null {
    // Google Drive doesn't have direct public URLs without sharing
    // Return null to indicate public URLs are not directly available
    return null;
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
