/**
 * Storage Provider Interface (BluDesign Domain Layer)
 *
 * High-level domain interface for BluDesign storage operations.
 * Implementations delegate file I/O to the shared BaseStorageProvider.
 *
 * Error types and StorageProviderType are re-exported from the shared base
 * so existing callers can keep importing from this module.
 */

import { Readable } from 'stream';
import {
  BluDesignFacility,
  StorageProviderType,
} from '../../types/bludesign.types';

// Re-export shared error types so existing callers don't break.
// NOTE: StorageProviderType is re-exported from bludesign.types.ts
export {
  StorageError,
  StorageErrorCode,
} from '@/services/storage/base-storage.interface';

// Re-export config types (mapped to the shared names for convenience)
export type {
  LocalStorageConfig as LocalProviderConfig,
  GCSStorageConfig as GCSProviderConfig,
  GDriveStorageConfig as GDriveProviderConfig,
} from '@/services/storage/base-storage.interface';

export interface StorageProviderConfig {
  type: StorageProviderType;
  config: Record<string, unknown>;
}

// ============================================================================
// Storage Provider Interface
// ============================================================================

export interface StorageProvider {
  readonly type: StorageProviderType;

  initialize(): Promise<void>;
  healthCheck(): Promise<boolean>;

  // -- Asset Operations ---------------------------------------------------
  uploadAssetFile(projectId: string, assetId: string, filename: string, data: Buffer, contentType: string): Promise<string>;
  downloadAssetFile(projectId: string, assetId: string, filename: string): Promise<Buffer>;
  deleteAssetFiles(projectId: string, assetId: string): Promise<void>;
  listAssetFiles(projectId: string, assetId: string): Promise<string[]>;

  // -- Global Asset Operations --------------------------------------------
  uploadGlobalAsset(modelId: string, filename: string, data: Buffer, contentType: string): Promise<string>;
  downloadGlobalAsset(modelId: string, filename: string): Promise<Buffer>;
  deleteGlobalAsset(modelId: string): Promise<void>;
  listGlobalAssetFiles(modelId: string): Promise<string[]>;

  // -- Texture Operations -------------------------------------------------
  uploadTexture(projectId: string, assetId: string, textureName: string, data: Buffer, contentType: string): Promise<string>;
  downloadTexture(projectId: string, assetId: string, textureName: string): Promise<Buffer>;
  deleteTexture(projectId: string, assetId: string, textureName: string): Promise<void>;

  // -- Facility Operations ------------------------------------------------
  saveFacilityManifest(projectId: string, facilityId: string, manifest: BluDesignFacility): Promise<void>;
  loadFacilityManifest(projectId: string, facilityId: string): Promise<BluDesignFacility>;
  deleteFacility(projectId: string, facilityId: string): Promise<void>;
  listFacilities(projectId: string): Promise<string[]>;

  // -- Project Operations -------------------------------------------------
  initializeProject(projectId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  getProjectStorageUsage(projectId: string): Promise<number>;

  // -- Export/Import Operations -------------------------------------------
  exportProjectAsZip(projectId: string): Promise<Readable>;
  importProjectFromZip(projectId: string, zipStream: Readable): Promise<void>;
  exportFacilityAsZip(projectId: string, facilityId: string, includeAssets: boolean): Promise<Readable>;

  // -- URL Generation -----------------------------------------------------
  getSignedUrl(projectId: string, filePath: string, expiresInSeconds: number): Promise<string>;
  getPublicUrl(projectId: string, filePath: string): string | null;
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
