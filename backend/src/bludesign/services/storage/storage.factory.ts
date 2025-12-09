/**
 * Storage Factory
 * 
 * Creates and manages storage provider instances.
 */

import {
  StorageProvider,
  StorageProviderConfig,
  LocalProviderConfig,
  GCSProviderConfig,
  GDriveProviderConfig,
  StorageError,
  StorageErrorCode,
} from './storage-provider.interface';
import { LocalStorageProvider } from './local.provider';
import { StorageProviderType } from '../../types/bludesign.types';

// Provider cache for reuse
const providerCache = new Map<string, StorageProvider>();

/**
 * Create a storage provider instance
 */
export function createStorageProvider(config: StorageProviderConfig): StorageProvider {
  const cacheKey = `${config.type}:${JSON.stringify(config.config)}`;
  
  // Check cache first
  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  let provider: StorageProvider;
  
  switch (config.type) {
    case StorageProviderType.LOCAL:
      provider = new LocalStorageProvider(config.config as unknown as LocalProviderConfig);
      break;
      
    case StorageProviderType.GCS:
      // TODO: Implement GCS provider
      throw new StorageError(
        'Google Cloud Storage provider not yet implemented',
        StorageErrorCode.CONFIGURATION_ERROR
      );
      
    case StorageProviderType.GDRIVE:
      // TODO: Implement Google Drive provider
      throw new StorageError(
        'Google Drive provider not yet implemented',
        StorageErrorCode.CONFIGURATION_ERROR
      );
      
    default:
      throw new StorageError(
        `Unknown storage provider type: ${config.type}`,
        StorageErrorCode.CONFIGURATION_ERROR
      );
  }
  
  // Cache the provider
  providerCache.set(cacheKey, provider);
  
  return provider;
}

/**
 * Get the default storage provider (local)
 */
export function getDefaultStorageProvider(): StorageProvider {
  const localConfig: LocalProviderConfig = {
    basePath: process.env.BLUDESIGN_STORAGE_PATH || './storage/bludesign',
    maxFileSizeMb: 100,
    allowedExtensions: ['.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp'],
  };
  
  const config: StorageProviderConfig = {
    type: StorageProviderType.LOCAL,
    config: localConfig as unknown as Record<string, unknown>,
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
  const errors: string[] = [];
  
  switch (config.type) {
    case StorageProviderType.LOCAL: {
      const localConfig = config.config as unknown as LocalProviderConfig;
      if (!localConfig.basePath) {
        errors.push('Local storage requires basePath');
      }
      break;
    }
    
    case StorageProviderType.GCS: {
      const gcsConfig = config.config as unknown as GCSProviderConfig;
      if (!gcsConfig.bucketName) {
        errors.push('GCS storage requires bucketName');
      }
      if (!gcsConfig.projectId) {
        errors.push('GCS storage requires projectId');
      }
      break;
    }
    
    case StorageProviderType.GDRIVE: {
      const gdriveConfig = config.config as unknown as GDriveProviderConfig;
      if (!gdriveConfig.clientId) {
        errors.push('Google Drive storage requires clientId');
      }
      if (!gdriveConfig.clientSecret) {
        errors.push('Google Drive storage requires clientSecret');
      }
      if (!gdriveConfig.rootFolderId) {
        errors.push('Google Drive storage requires rootFolderId');
      }
      break;
    }
    
    default:
      errors.push(`Unknown storage provider type: ${config.type}`);
  }
  
  return errors;
}

