/**
 * Facility Storage Adapter
 *
 * Thin wrapper around BaseStorageProvider for reading / writing facility
 * scene data (camera, placed objects, buildings, etc.) to the configured
 * storage bucket.
 *
 * Follows the same pattern as FirmwareStorageAdapter.
 */

import { BaseStorageProvider } from '@/services/storage';
import { getBluDesignBaseStorageProvider, invalidateBluDesignStorageCache } from './bludesign-storage.factory';
import { logger } from '@/utils/logger';
import { FacilityData } from './facility.service';

const FACILITY_PREFIX = 'bludesign/user-facilities';

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
  private injectedBase?: BaseStorageProvider;

  constructor(base?: BaseStorageProvider) {
    this.injectedBase = base;
  }

  private async resolveBase(): Promise<BaseStorageProvider> {
    return this.injectedBase ?? getBluDesignBaseStorageProvider();
  }

  async saveData(userId: string, facilityId: string, data: FacilityData): Promise<void> {
    const base = await this.resolveBase();
    const path = dataPath(userId, facilityId);
    const json = JSON.stringify(data, null, 2);
    await base.uploadFile(path, Buffer.from(json, 'utf-8'), 'application/json');
    logger.debug(`Facility data saved to storage: ${path}`);
  }

  async loadData(userId: string, facilityId: string): Promise<FacilityData> {
    const base = await this.resolveBase();
    const path = dataPath(userId, facilityId);
    const buffer = await base.downloadFile(path);
    return JSON.parse(buffer.toString('utf-8')) as FacilityData;
  }

  async saveLayoutSource(userId: string, facilityId: string, data: Buffer): Promise<void> {
    const base = await this.resolveBase();
    const path = layoutSourcePath(userId, facilityId);
    await base.uploadFile(path, data, 'image/png');
    logger.debug(`Layout source saved to storage: ${path}`);
  }

  async loadLayoutSource(userId: string, facilityId: string): Promise<Buffer> {
    const base = await this.resolveBase();
    const path = layoutSourcePath(userId, facilityId);
    return base.downloadFile(path);
  }

  async hasLayoutSource(userId: string, facilityId: string): Promise<boolean> {
    try {
      await this.loadLayoutSource(userId, facilityId);
      return true;
    } catch {
      return false;
    }
  }

  /** Copy persisted import plan PNG from one facility folder to another (same user). */
  async copyLayoutSource(
    userId: string,
    sourceFacilityId: string,
    targetFacilityId: string,
  ): Promise<void> {
    const buffer = await this.loadLayoutSource(userId, sourceFacilityId);
    await this.saveLayoutSource(userId, targetFacilityId, buffer);
    logger.debug(
      `Layout source copied: ${sourceFacilityId} → ${targetFacilityId} for user ${userId}`,
    );
  }

  async deleteData(userId: string, facilityId: string): Promise<void> {
    const base = await this.resolveBase();
    const dir = directoryPath(userId, facilityId);
    try {
      await base.deleteDirectory(dir);
      logger.debug(`Facility storage deleted: ${dir}`);
    } catch (err) {
      logger.warn(`Failed to delete facility storage at ${dir}:`, err);
    }
  }
}

/** Clear the cached provider (for testing). */
export function clearFacilityStorageCache(): void {
  invalidateBluDesignStorageCache();
}
