/**
 * Storage Provider Interface
 * 
 * Abstract interface for BluDesign storage backends.
 * Supports local file storage, Google Cloud Storage, and Google Drive.
 */

import { Readable } from 'stream';
import {
  BluDesignAsset,
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

// ============================================================================
// Storage Provider Interface
// ============================================================================

export interface StorageProvider {
  readonly type: StorageProviderType;
  
  /**
   * Initialize the storage provider
   */
  initialize(): Promise<void>;
  
  /**
   * Check if the provider is properly configured and accessible
   */
  healthCheck(): Promise<boolean>;
  
  // ========================================================================
  // Asset Operations
  // ========================================================================
  
  /**
   * Upload an asset file (geometry: glb, gltf, fbx)
   * @returns The storage path/URL of the uploaded file
   */
  uploadAssetFile(
    projectId: string,
    assetId: string,
    filename: string,
    data: Buffer,
    contentType: string
  ): Promise<string>;
  
  /**
   * Download an asset file
   */
  downloadAssetFile(
    projectId: string,
    assetId: string,
    filename: string
  ): Promise<Buffer>;
  
  /**
   * Delete an asset and all its files
   */
  deleteAssetFiles(projectId: string, assetId: string): Promise<void>;
  
  /**
   * List all files for an asset
   */
  listAssetFiles(projectId: string, assetId: string): Promise<string[]>;
  
  // ========================================================================
  // Texture Operations
  // ========================================================================
  
  /**
   * Upload a texture file
   * @returns The storage path/URL of the uploaded texture
   */
  uploadTexture(
    projectId: string,
    assetId: string,
    textureName: string,
    data: Buffer,
    contentType: string
  ): Promise<string>;
  
  /**
   * Download a texture file
   */
  downloadTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<Buffer>;
  
  /**
   * Delete a texture
   */
  deleteTexture(
    projectId: string,
    assetId: string,
    textureName: string
  ): Promise<void>;
  
  // ========================================================================
  // Facility Operations
  // ========================================================================
  
  /**
   * Save a facility manifest (JSON)
   */
  saveFacilityManifest(
    projectId: string,
    facilityId: string,
    manifest: BluDesignFacility
  ): Promise<void>;
  
  /**
   * Load a facility manifest
   */
  loadFacilityManifest(
    projectId: string,
    facilityId: string
  ): Promise<BluDesignFacility>;
  
  /**
   * Delete a facility and its manifest
   */
  deleteFacility(projectId: string, facilityId: string): Promise<void>;
  
  /**
   * List all facilities in a project
   */
  listFacilities(projectId: string): Promise<string[]>;
  
  // ========================================================================
  // Project Operations
  // ========================================================================
  
  /**
   * Create project directory structure
   */
  initializeProject(projectId: string): Promise<void>;
  
  /**
   * Delete entire project and all contents
   */
  deleteProject(projectId: string): Promise<void>;
  
  /**
   * Get total storage used by a project (in bytes)
   */
  getProjectStorageUsage(projectId: string): Promise<number>;
  
  // ========================================================================
  // Export/Import Operations
  // ========================================================================
  
  /**
   * Export entire project as a zip stream
   */
  exportProjectAsZip(projectId: string): Promise<Readable>;
  
  /**
   * Import project from a zip stream
   */
  importProjectFromZip(projectId: string, zipStream: Readable): Promise<void>;
  
  /**
   * Export a single facility with its assets as a zip
   */
  exportFacilityAsZip(
    projectId: string,
    facilityId: string,
    includeAssets: boolean
  ): Promise<Readable>;
  
  // ========================================================================
  // URL Generation
  // ========================================================================
  
  /**
   * Get a signed/temporary URL for direct file access
   * @param expiresInSeconds How long the URL should be valid
   */
  getSignedUrl(
    projectId: string,
    filePath: string,
    expiresInSeconds: number
  ): Promise<string>;
  
  /**
   * Get public URL if the file is publicly accessible
   */
  getPublicUrl(projectId: string, filePath: string): string | null;
}

// ============================================================================
// Storage Provider Configuration
// ============================================================================

export interface StorageProviderConfig {
  type: StorageProviderType;
  config: Record<string, unknown>;
}

export interface LocalProviderConfig {
  basePath: string;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
}

export interface GCSProviderConfig {
  bucketName: string;
  projectId: string;
  keyFilePath?: string;
  keyFileContents?: string;
  publicBucket?: boolean;
}

export interface GDriveProviderConfig {
  clientId: string;
  clientSecret: string;
  rootFolderId: string;
  accessToken?: string;
  refreshToken?: string;
}

// ============================================================================
// Storage Errors
// ============================================================================

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export enum StorageErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_FILE = 'INVALID_FILE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

// ============================================================================
// Storage Events (for progress tracking)
// ============================================================================

export interface StorageProgressEvent {
  operation: 'upload' | 'download' | 'delete' | 'export' | 'import';
  projectId: string;
  itemId?: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

export type StorageProgressCallback = (event: StorageProgressEvent) => void;

