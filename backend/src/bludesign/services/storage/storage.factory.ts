/**
 * BluDesign Storage Factory
 *
 * Creates domain-level StorageProvider instances that wrap the shared
 * BaseStorageProvider implementations.
 */

import {
  StorageProvider,
  StorageProviderConfig,
  StorageError,
  StorageErrorCode,
} from './storage-provider.interface';
import { LocalStorageProvider } from './local.provider';
import { GCSStorageProvider } from './gcs.provider';
import { GDriveStorageProvider } from './gdrive.provider';
import { StorageProviderType } from '../../types/bludesign.types';
import {
  LocalStorageConfig,
  GCSStorageConfig,
  GDriveStorageConfig,
  validateBaseStorageConfig,
} from '@/services/storage';

// Provider cache for reuse (uses stable keys via the base factory)
const providerCache = new Map<string, StorageProvider>();

function buildCacheKey(config: StorageProviderConfig): string {
  switch (config.type) {
    case StorageProviderType.LOCAL: {
      const c = config.config as unknown as LocalStorageConfig;
      return `bd:local:${c.basePath}`;
    }
    case StorageProviderType.GCS: {
      const c = config.config as unknown as GCSStorageConfig;
      return `bd:gcs:${c.bucketName}:${c.projectId}`;
    }
    case StorageProviderType.GDRIVE: {
      const c = config.config as unknown as GDriveStorageConfig;
      return `bd:gdrive:${c.clientId}:${c.rootFolderId}`;
    }
    default:
      return `bd:${config.type}:${JSON.stringify(config.config)}`;
  }
}

/**
 * Create a BluDesign storage provider instance
 */
export function createStorageProvider(config: StorageProviderConfig): StorageProvider {
  const cacheKey = buildCacheKey(config);
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  let provider: StorageProvider;

  switch (config.type) {
    case StorageProviderType.LOCAL:
      provider = new LocalStorageProvider(config.config as unknown as LocalStorageConfig & { maxFileSizeMb?: number; allowedExtensions?: string[] });
      break;
    case StorageProviderType.GCS:
      provider = new GCSStorageProvider(config.config as unknown as GCSStorageConfig);
      break;
    case StorageProviderType.GDRIVE:
      provider = new GDriveStorageProvider(config.config as unknown as GDriveStorageConfig);
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
 * Default GCS storage config used when a project has no explicit config.
 * Centralised so every caller shares the same fallback.
 */
export const DEFAULT_BLUDESIGN_STORAGE_CONFIG: Record<string, unknown> = {
  projectId: process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev',
  bucketName: process.env.GCS_BUCKET_NAME || 'blulok-develop',
};

/**
 * Build a StorageProviderConfig from a project record, falling back
 * to the system-wide GCS default when the project has no explicit config.
 */
export function storageConfigForProject(project: {
  storageProvider: StorageProviderType;
  storageConfig?: Record<string, unknown> | null;
}): StorageProviderConfig {
  return {
    type: project.storageProvider,
    config: project.storageConfig || DEFAULT_BLUDESIGN_STORAGE_CONFIG,
  };
}

/**
 * Get the default storage provider (GCS with Application Default Credentials)
 */
export function getDefaultStorageProvider(): StorageProvider {
  const config: StorageProviderConfig = {
    type: StorageProviderType.GCS,
    config: {
      ...DEFAULT_BLUDESIGN_STORAGE_CONFIG,
      maxFileSizeMb: 100,
      allowedExtensions: ['.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp'],
    } as unknown as Record<string, unknown>,
  };
  return createStorageProvider(config);
}

/**
 * Clear the provider cache (for testing)
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * Validate storage configuration
 */
export function validateStorageConfig(config: StorageProviderConfig): string[] {
  return validateBaseStorageConfig({ type: config.type, config: config.config });
}
