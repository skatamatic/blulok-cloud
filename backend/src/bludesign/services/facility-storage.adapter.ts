/**
 * Facility Storage Adapter
 *
 * Thin wrapper around BaseStorageProvider for reading / writing facility
 * scene data (camera, placed objects, buildings, etc.) to the configured
 * storage bucket.
 *
 * Follows the same pattern as FirmwareStorageAdapter.
 */

import {
  BaseStorageProvider,
  StorageProviderType,
  createBaseStorageProvider,
} from '@/services/storage';
import { DEFAULT_BLUDESIGN_STORAGE_CONFIG } from './storage/storage.factory';
import { logger } from '@/utils/logger';
import { FacilityData } from './facility.service';

const FACILITY_PREFIX = 'bludesign/user-facilities';

let cachedProvider: BaseStorageProvider | null = null;

function getBaseProvider(): BaseStorageProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = createBaseStorageProvider({
    type: StorageProviderType.GCS,
    config: DEFAULT_BLUDESIGN_STORAGE_CONFIG,
  });
  return cachedProvider;
}

function assertSafeSegment(value: string, label: string): void {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid ${label}: path traversal detected`);
  }
}

function dataPath(userId: string, facilityId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(facilityId, 'facilityId');
  return `${FACILITY_PREFIX}/${userId}/${facilityId}/data.json`;
}

function layoutSourcePath(userId: string, facilityId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(facilityId, 'facilityId');
  return `${FACILITY_PREFIX}/${userId}/${facilityId}/layout-source.png`;
}

function directoryPath(userId: string, facilityId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(facilityId, 'facilityId');
  return `${FACILITY_PREFIX}/${userId}/${facilityId}`;
}

export class FacilityStorageAdapter {
  private base: BaseStorageProvider;

  constructor(base?: BaseStorageProvider) {
    this.base = base ?? getBaseProvider();
  }

  async saveData(userId: string, facilityId: string, data: FacilityData): Promise<void> {
    const path = dataPath(userId, facilityId);
    const json = JSON.stringify(data, null, 2);
    await this.base.uploadFile(path, Buffer.from(json, 'utf-8'), 'application/json');
    logger.debug(`Facility data saved to storage: ${path}`);
  }

  async loadData(userId: string, facilityId: string): Promise<FacilityData> {
    const path = dataPath(userId, facilityId);
    const buffer = await this.base.downloadFile(path);
    return JSON.parse(buffer.toString('utf-8')) as FacilityData;
  }

  async saveLayoutSource(userId: string, facilityId: string, data: Buffer): Promise<void> {
    const path = layoutSourcePath(userId, facilityId);
    await this.base.uploadFile(path, data, 'image/png');
    logger.debug(`Layout source saved to storage: ${path}`);
  }

  async loadLayoutSource(userId: string, facilityId: string): Promise<Buffer> {
    const path = layoutSourcePath(userId, facilityId);
    return this.base.downloadFile(path);
  }

  async hasLayoutSource(userId: string, facilityId: string): Promise<boolean> {
    try {
      await this.loadLayoutSource(userId, facilityId);
      return true;
    } catch {
      return false;
    }
  }

  async deleteData(userId: string, facilityId: string): Promise<void> {
    const dir = directoryPath(userId, facilityId);
    try {
      await this.base.deleteDirectory(dir);
      logger.debug(`Facility storage deleted: ${dir}`);
    } catch (err) {
      logger.warn(`Failed to delete facility storage at ${dir}:`, err);
    }
  }
}

/** Clear the cached provider (for testing). */
export function clearFacilityStorageCache(): void {
  cachedProvider = null;
}
