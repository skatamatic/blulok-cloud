/**
 * Facility Service
 *
 * Manages user facility metadata in the DB and delegates scene data
 * (camera, placed objects, buildings, etc.) to the storage bucket via
 * FacilityStorageAdapter.
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { FacilityStorageAdapter } from './facility-storage.adapter';

export interface FacilityData {
  name: string;
  version: string;
  camera: unknown;
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
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (thumbnail !== undefined) {
      updates.thumbnail = thumbnail;
    }

    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update(updates);

    await this.storage.saveData(userId, id, data);
  }

  async deleteFacility(id: string, userId: string): Promise<void> {
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

  async updateLastOpened(id: string, userId: string): Promise<void> {
    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update({
        last_opened: new Date(),
      });
  }
}
