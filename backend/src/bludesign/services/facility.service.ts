/**
 * Facility Service
 * 
 * Manages user facility data (save/load).
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export interface FacilityData {
  name: string;
  version: string;
  camera: any;
  placedObjects: any[];
  gridSize: number;
  showGrid: boolean;
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
  constructor(private db: Knex) {}

  /**
   * Get all facilities for a user
   */
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

  /**
   * Get a specific facility
   */
  async getFacility(id: string, userId: string): Promise<Facility | null> {
    const facility = await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .first();

    if (!facility) return null;

    // Parse JSON data field
    return {
      ...facility,
      data: typeof facility.data === 'string' ? JSON.parse(facility.data) : facility.data,
    };
  }

  /**
   * Save a new facility
   */
  async saveFacility(
    userId: string,
    name: string,
    data: FacilityData,
    thumbnail?: string
  ): Promise<Facility> {
    const id = uuidv4();
    const now = new Date();

    // Stringify the data object for storage
    const dbRecord = {
      id,
      user_id: userId,
      name,
      data: JSON.stringify(data),
      thumbnail: thumbnail || null,
      last_opened: now,
      created_at: now,
      updated_at: now,
    };

    await this.db('bludesign_user_facilities').insert(dbRecord);

    // Return the facility with parsed data
    return {
      id,
      user_id: userId,
      name,
      data,
      thumbnail: thumbnail || null,
      last_opened: now,
      created_at: now,
      updated_at: now,
    } as Facility;
  }

  /**
   * Update an existing facility
   */
  async updateFacility(
    id: string,
    userId: string,
    data: FacilityData,
    thumbnail?: string
  ): Promise<void> {
    const updates: any = {
      data: JSON.stringify(data), // Stringify for storage
      updated_at: new Date(),
    };

    if (thumbnail !== undefined) {
      updates.thumbnail = thumbnail;
    }

    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update(updates);
  }

  /**
   * Delete a facility
   */
  async deleteFacility(id: string, userId: string): Promise<void> {
    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .delete();
  }

  /**
   * Get the last opened facility for a user
   */
  async getLastOpened(userId: string): Promise<Facility | null> {
    const facility = await this.db('bludesign_user_facilities')
      .where({ user_id: userId })
      .whereNotNull('last_opened')
      .orderBy('last_opened', 'desc')
      .first();

    if (!facility) return null;

    // Parse JSON data field
    return {
      ...facility,
      data: typeof facility.data === 'string' ? JSON.parse(facility.data) : facility.data,
    };
  }

  /**
   * Update last opened timestamp
   */
  async updateLastOpened(id: string, userId: string): Promise<void> {
    await this.db('bludesign_user_facilities')
      .where({ id, user_id: userId })
      .update({
        last_opened: new Date(),
      });
  }
}



