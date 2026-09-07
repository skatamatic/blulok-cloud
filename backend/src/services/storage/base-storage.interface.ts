/**
 * Base Storage Provider Interface
 *
 * Low-level file storage abstraction shared by both BluDesign (assets/facilities)
 * and Firmware (OTA binaries).  Each backend (local FS, GCS, Google Drive)
 * implements this interface once; domain layers add their own path conventions
 * and validation on top.
 */

import { Readable } from 'stream';

// ============================================================================
// Provider Types (shared across all storage consumers)
// ============================================================================

export enum StorageProviderType {
  LOCAL = 'local',
  GCS = 'gcs',
  GDRIVE = 'gdrive',
}

// ============================================================================
// Base Storage Provider Interface
// ============================================================================

export interface BaseStorageProvider {
  readonly type: StorageProviderType;

  /** One-time initialisation (verify connectivity, create root dirs, etc.) */
  initialize(): Promise<void>;

  /** Quick liveness probe */
  healthCheck(): Promise<boolean>;

  // --- Core file operations ------------------------------------------------

  /**
   * Upload / overwrite a file.
   * @param filePath  Logical path, e.g. `firmware/abc/v1.bin`
   * @param data      File contents
   * @param contentType  Optional MIME type hint
   * @returns The canonical storage reference for later download/delete
   */
  uploadFile(filePath: string, data: Buffer, contentType?: string): Promise<string>;

  /** Download file contents by logical path */
  downloadFile(filePath: string): Promise<Buffer>;

  /** Delete a single file (no-op if missing) */
  deleteFile(filePath: string): Promise<void>;

  /** Check whether a file exists at the given path */
  fileExists(filePath: string): Promise<boolean>;

  /**
   * List file names directly under `prefix`.
   * Returns file names only (not full paths), excluding sub-directories.
   */
  listFiles(prefix: string): Promise<string[]>;

  // --- Directory operations ------------------------------------------------

  /** Recursively delete everything under `dirPath` (including the dir itself) */
  deleteDirectory(dirPath: string): Promise<void>;

  /** Recursively calculate total bytes stored under `dirPath` */
  getDirectorySize(dirPath: string): Promise<number>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface BaseStorageConfig {
  type: StorageProviderType;
  config: Record<string, unknown>;
}

export interface LocalStorageConfig {
  basePath: string;
}

export interface GCSStorageConfig {
  bucketName: string;
  projectId: string;
  keyFilePath?: string;
  keyFileContents?: string;
  publicBucket?: boolean;
}

export interface GDriveStorageConfig {
  clientId: string;
  clientSecret: string;
  rootFolderId: string;
  accessToken?: string;
  refreshToken?: string;
}

// ============================================================================
// Storage Errors
// ============================================================================

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

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
