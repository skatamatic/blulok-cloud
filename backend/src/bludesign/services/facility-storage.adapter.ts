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
const TERRAIN_DATA_PREFIX = 'bludesign/terrain-data';

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

function terrainImageryPath(userId: string, facilityId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(facilityId, 'facilityId');
  return `${FACILITY_PREFIX}/${userId}/${facilityId}/terrain-imagery.jpg`;
}

function terrainHeightmapPath(userId: string, facilityId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(facilityId, 'facilityId');
  return `${FACILITY_PREFIX}/${userId}/${facilityId}/terrain-heightmap.png`;
}

function terrainDataImageryPath(userId: string, terrainDataId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(terrainDataId, 'terrainDataId');
  return `${TERRAIN_DATA_PREFIX}/${userId}/${terrainDataId}/imagery.jpg`;
}

function terrainDataHeightmapPath(userId: string, terrainDataId: string): string {
  assertSafeSegment(userId, 'userId');
  assertSafeSegment(terrainDataId, 'terrainDataId');
  return `${TERRAIN_DATA_PREFIX}/${userId}/${terrainDataId}/heightmap.png`;
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

  async saveTerrainImagery(userId: string, facilityId: string, data: Buffer): Promise<void> {
    const base = await this.resolveBase();
    const path = terrainImageryPath(userId, facilityId);
    await base.uploadFile(path, data, 'image/jpeg');
    logger.debug(`Terrain imagery saved to storage: ${path}`);
  }

  async loadTerrainImagery(userId: string, facilityId: string): Promise<Buffer> {
    const base = await this.resolveBase();
    return base.downloadFile(terrainImageryPath(userId, facilityId));
  }

  async saveTerrainDataImagery(userId: string, terrainDataId: string, data: Buffer): Promise<void> {
    const base = await this.resolveBase();
    const path = terrainDataImageryPath(userId, terrainDataId);
    await base.uploadFile(path, data, 'image/jpeg');
    logger.debug(`Terrain imagery saved to storage: ${path}`);
  }

  async loadTerrainDataImagery(userId: string, terrainDataId: string): Promise<Buffer> {
    const base = await this.resolveBase();
    return base.downloadFile(terrainDataImageryPath(userId, terrainDataId));
  }

  async saveTerrainHeightmap(userId: string, facilityId: string, data: Buffer): Promise<void> {
    const base = await this.resolveBase();
    const path = terrainHeightmapPath(userId, facilityId);
    await base.uploadFile(path, data, 'image/png');
    logger.debug(`Terrain heightmap saved to storage: ${path}`);
  }

  async loadTerrainHeightmap(userId: string, facilityId: string): Promise<Buffer> {
    const base = await this.resolveBase();
    return base.downloadFile(terrainHeightmapPath(userId, facilityId));
  }

  async saveTerrainDataHeightmap(userId: string, terrainDataId: string, data: Buffer): Promise<void> {
    const base = await this.resolveBase();
    const path = terrainDataHeightmapPath(userId, terrainDataId);
    await base.uploadFile(path, data, 'image/png');
    logger.debug(`Terrain heightmap saved to storage: ${path}`);
  }

  async loadTerrainDataHeightmap(userId: string, terrainDataId: string): Promise<Buffer> {
    const base = await this.resolveBase();
    return base.downloadFile(terrainDataHeightmapPath(userId, terrainDataId));
  }

  /** Remove persisted terrain sidecars for a terrain data id (best-effort per file). */
  async deleteTerrainData(userId: string, terrainDataId: string): Promise<void> {
    const base = await this.resolveBase();
    const paths = [
      terrainDataImageryPath(userId, terrainDataId),
      terrainDataHeightmapPath(userId, terrainDataId),
    ];
    for (const path of paths) {
      try {
        await base.deleteFile(path);
      } catch {
        // File may not exist (draft never applied, partial upload, etc.)
      }
    }
    logger.debug(`Terrain data deleted from storage: ${terrainDataId} for user ${userId}`);
  }

  /** Copy terrain sidecars from one facility folder to another (same user). */
  async copyTerrainAssets(
    userId: string,
    sourceFacilityId: string,
    targetFacilityId: string,
  ): Promise<void> {
    try {
      const imagery = await this.loadTerrainImagery(userId, sourceFacilityId);
      await this.saveTerrainImagery(userId, targetFacilityId, imagery);
    } catch {
      // Source may not have terrain imagery
    }
    try {
      const heightmap = await this.loadTerrainHeightmap(userId, sourceFacilityId);
      await this.saveTerrainHeightmap(userId, targetFacilityId, heightmap);
    } catch {
      // Source may not have terrain heightmap
    }
    logger.debug(
      `Terrain assets copied: ${sourceFacilityId} → ${targetFacilityId} for user ${userId}`,
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
