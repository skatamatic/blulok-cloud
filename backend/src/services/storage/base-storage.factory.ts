/**
 * Base Storage Factory
 *
 * Creates and caches BaseStorageProvider instances from configuration.
 * Used by both the BluDesign domain layer and the Firmware domain layer.
 */

import {
  BaseStorageProvider,
  BaseStorageConfig,
  LocalStorageConfig,
  GCSStorageConfig,
  GDriveStorageConfig,
  StorageError,
  StorageErrorCode,
  StorageProviderType,
} from './base-storage.interface';
import { LocalBaseStorage } from './local-base.provider';
import { GCSBaseStorage } from './gcs-base.provider';
import { GDriveBaseStorage } from './gdrive-base.provider';

// FIX #9: Cache uses stable, non-secret identifiers
const providerCache = new Map<string, BaseStorageProvider>();

/**
 * Build a stable cache key that does NOT include secrets (tokens, keys).
 */
function buildCacheKey(config: BaseStorageConfig): string {
  switch (config.type) {
    case StorageProviderType.LOCAL: {
      const c = config.config as unknown as LocalStorageConfig;
      return `local:${c.basePath}`;
    }
    case StorageProviderType.GCS: {
      const c = config.config as unknown as GCSStorageConfig;
      return `gcs:${c.bucketName}:${c.projectId}`;
    }
    case StorageProviderType.GDRIVE: {
      const c = config.config as unknown as GDriveStorageConfig;
      return `gdrive:${c.clientId}:${c.rootFolderId}`;
    }
    default:
      return `${config.type}:${JSON.stringify(config.config)}`;
  }
}

/**
 * Create (or return cached) BaseStorageProvider.
 */
export function createBaseStorageProvider(config: BaseStorageConfig): BaseStorageProvider {
  const cacheKey = buildCacheKey(config);
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  let provider: BaseStorageProvider;

  switch (config.type) {
    case StorageProviderType.LOCAL:
      provider = new LocalBaseStorage(config.config as unknown as LocalStorageConfig);
      break;
    case StorageProviderType.GCS:
      provider = new GCSBaseStorage(config.config as unknown as GCSStorageConfig);
      break;
    case StorageProviderType.GDRIVE:
      provider = new GDriveBaseStorage(config.config as unknown as GDriveStorageConfig);
      break;
    default:
      throw new StorageError(
        `Unknown storage provider type: ${config.type}`,
        StorageErrorCode.CONFIGURATION_ERROR,
      );
  }

  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Validate a storage config, returning an array of human-readable errors.
 */
export function validateBaseStorageConfig(config: BaseStorageConfig): string[] {
  const errors: string[] = [];

  switch (config.type) {
    case StorageProviderType.LOCAL: {
      const c = config.config as unknown as LocalStorageConfig;
      if (!c.basePath) errors.push('Local storage requires basePath');
      break;
    }
    case StorageProviderType.GCS: {
      const c = config.config as unknown as GCSStorageConfig;
      if (!c.bucketName) errors.push('GCS storage requires bucketName');
      if (!c.projectId) errors.push('GCS storage requires projectId');
      break;
    }
    case StorageProviderType.GDRIVE: {
      const c = config.config as unknown as GDriveStorageConfig;
      if (!c.clientId) errors.push('Google Drive storage requires clientId');
      if (!c.clientSecret) errors.push('Google Drive storage requires clientSecret');
      if (!c.rootFolderId) errors.push('Google Drive storage requires rootFolderId');
      break;
    }
    default:
      errors.push(`Unknown storage provider type: ${config.type}`);
  }

  return errors;
}

/** Clear the provider cache (for testing) */
export function clearBaseProviderCache(): void {
  providerCache.clear();
}
