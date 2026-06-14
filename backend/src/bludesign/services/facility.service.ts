/**
 * Facility Service
 *
 * Manages user facility metadata in the DB and delegates scene data
 * (camera, placed objects, buildings, etc.) to the storage bucket via
 * FacilityStorageAdapter.
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import { FacilityStorageAdapter } from './facility-storage.adapter';
import { AssetService } from './asset.service';
import { extractFacilityAssetIds, countAssetPlacementsInFacility } from './facilityAssetUsage';

export interface FacilityData {
  name: string;
  version: string;
  camera: unknown;
  /** Optional saved home camera — restored on facility load. */
  defaultCamera?: unknown;
  placedObjects: unknown[];
  gridSize: number;
  showGrid: boolean;
  [key: string]: unknown;
}

export interface Facility {
  id: string;
  user_id: string;
  name: string;
  data: FacilityData;
  thumbnail: string | null;
  last_opened: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface FacilitySummary {
  id: string;
  name: string;
  thumbnail: string | null;
  lastOpened: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface AssetFacilityUsage {
  id: string;
  name: string;
  updatedAt: Date;
  /** Number of placed objects in this facility using the asset. */
  usageCount: number;
}

export class FacilityService {
  private storage: FacilityStorageAdapter;

  constructor(private db: Knex, storage?: FacilityStorageAdapter) {
    this.storage = storage ?? new FacilityStorageAdapter();
  }

  async getUserFacilities(userId: string): Promise<FacilitySummary[]> {
    const facilities = await this.db('bludesign_user_facilities')
      .where({ user_id: userId })
      .orderBy('updated_at', 'desc')
      .select('id', 'name', 'thumbnail', 'last_opened', 'created_at', 'updated_at');

    return facilities.map(f => ({
      id: f.id,
      name: f.name,
      thumbnail: f.thumbnail,
      lastOpened: f.last_opened,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));
  }

  async getFacility(id: string, userId: string): Promise<Facility | null> {
    const row = await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .first();

    if (!row) return null;

    const data = await this.storage.loadData(userId, id);

    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      data,
      thumbnail: row.thumbnail,
      last_opened: row.last_opened,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async saveFacility(
    userId: string,
    name: string,
    data: FacilityData,
    thumbnail?: string,
    copyLayoutSourceFrom?: string,
  ): Promise<Facility> {
    const id = uuidv4();
    const now = new Date();

    const dbRecord = {
      id,
      user_id: userId,
      name,
      thumbnail: thumbnail || null,
      last_opened: now,
      created_at: now,
      updated_at: now,
    };

    await this.db('bludesign_user_facilities').insert(dbRecord);
    await this.storage.saveData(userId, id, data);
    await AssetService.incrementFacilityUsage(extractFacilityAssetIds(data));

    if (copyLayoutSourceFrom) {
      await this.copyLayoutSourceBetweenFacilities(copyLayoutSourceFrom, id, userId);
    }

    return {
      id,
      user_id: userId,
      name,
      data,
      thumbnail: thumbnail || null,
      last_opened: now,
      created_at: now,
      updated_at: now,
    };
  }

  async updateFacility(
    id: string,
    userId: string,
    data: FacilityData,
    thumbnail?: string,
  ): Promise<void> {
    const existing = await this.getFacility(id, userId);
    if (!existing) {
      throw new NotFoundError('Facility');
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (thumbnail !== undefined) {
      updates.thumbnail = thumbnail;
    }

    const affected = await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update(updates);

    if (!affected) {
      throw new NotFoundError('Facility');
    }

    await this.storage.saveData(userId, id, data);
    await AssetService.syncFacilityAssetUsage(
      extractFacilityAssetIds(existing.data),
      extractFacilityAssetIds(data)
    );
  }

  async deleteFacility(id: string, userId: string): Promise<void> {
    const existing = await this.getFacility(id, userId);
    if (existing) {
      await AssetService.decrementFacilityUsage(extractFacilityAssetIds(existing.data));
    }

    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .delete();

    await this.storage.deleteData(userId, id);
  }

  async getLastOpened(userId: string): Promise<Facility | null> {
    const row = await this.db('bludesign_user_facilities')
      .where({ user_id: userId })
      .whereNotNull('last_opened')
      .orderBy('last_opened', 'desc')
      .first();

    if (!row) return null;

    const data = await this.storage.loadData(userId, row.id);

    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      data,
      thumbnail: row.thumbnail,
      last_opened: row.last_opened,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async saveLayoutSource(id: string, userId: string, buffer: Buffer): Promise<void> {
    const row = await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .first();
    if (!row) {
      throw new NotFoundError('Facility');
    }
    await this.storage.saveLayoutSource(userId, id, buffer);
  }

  async loadLayoutSource(id: string, userId: string): Promise<Buffer> {
    const row = await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .first();
    if (!row) {
      throw new NotFoundError('Facility');
    }
    return this.storage.loadLayoutSource(userId, id);
  }

  /**
   * Copy layout-source.png from an existing facility into a newly saved one.
   * Skips silently when the source has no plan file (metadata-only copies still succeed).
   */
  async copyLayoutSourceBetweenFacilities(
    sourceFacilityId: string,
    targetFacilityId: string,
    userId: string,
  ): Promise<void> {
    const source = await this.getFacility(sourceFacilityId, userId);
    if (!source) {
      throw new NotFoundError('Facility');
    }

    const target = await this.getFacility(targetFacilityId, userId);
    if (!target) {
      throw new NotFoundError('Facility');
    }

    try {
      await this.storage.copyLayoutSource(userId, sourceFacilityId, targetFacilityId);
    } catch (error) {
      logger.warn(
        `Layout source copy skipped (${sourceFacilityId} → ${targetFacilityId}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async updateLastOpened(id: string, userId: string): Promise<void> {
    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update({
        last_opened: new Date(),
      });
  }

  /** Saved facilities whose scene data references the given asset definition id. */
  async listFacilitiesUsingAsset(
    userId: string,
    assetDefinitionId: string,
  ): Promise<AssetFacilityUsage[]> {
    const summaries = await this.getUserFacilities(userId);
    const matches: AssetFacilityUsage[] = [];

    for (const summary of summaries) {
      try {
        const data = await this.storage.loadData(userId, summary.id);
        const usageCount = countAssetPlacementsInFacility(data, assetDefinitionId);
        if (usageCount > 0) {
          matches.push({
            id: summary.id,
            name: summary.name,
            updatedAt: summary.updatedAt,
            usageCount,
          });
        }
      } catch {
        // Skip facilities with unreadable storage payloads.
      }
    }

    return matches.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }
}
