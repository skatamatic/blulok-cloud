/**
 * BluDesign Facility Model
 * 
 * Model for facility metadata storage.
 */

import { BaseModel } from '@/models/base.model';
import {
  BluDesignFacility,
  PlacedObject,
  SceneSettings,
  BrandingConfig,
  CreateFacilityRequest,
  UpdateFacilityRequest,
  DEFAULT_SCENE_SETTINGS,
} from '../types/bludesign.types';

export interface BluDesignFacilityRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  version: string;
  asset_manifest: string; // JSON array of asset IDs
  objects: string; // JSON array of placed objects
  settings: string; // JSON
  branding_config: string | null; // JSON
  linked_facility_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export class BluDesignFacilityModel extends BaseModel {
  protected static get tableName(): string {
    return 'bludesign_facilities';
  }

  /**
   * Convert database row to domain object
   */
  private static toDomain(row: BluDesignFacilityRow): BluDesignFacility {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      version: row.version,
      assetManifest: JSON.parse(row.asset_manifest),
      objects: JSON.parse(row.objects),
      settings: JSON.parse(row.settings),
      brandingConfig: row.branding_config ? JSON.parse(row.branding_config) : undefined,
      linkedFacilityId: row.linked_facility_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by ?? '',
    };
  }

  /**
   * Find facility by ID
   */
  static async findById(id: string): Promise<BluDesignFacility | undefined> {
    const row = await this.query().where('id', id).first() as BluDesignFacilityRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Find all facilities in a project
   */
  static async findByProject(
    projectId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<BluDesignFacility[]> {
    let query = this.query().where('project_id', projectId);

    if (options?.search) {
      query = query.where('name', 'like', `%${options.search}%`);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    query = query.orderBy('updated_at', 'desc');

    const rows = await query as BluDesignFacilityRow[];
    return rows.map(this.toDomain);
  }

  /**
   * Find facility linked to a BluLok facility
   */
  static async findByLinkedFacility(linkedFacilityId: string): Promise<BluDesignFacility | undefined> {
    const row = await this.query()
      .where('linked_facility_id', linkedFacilityId)
      .first() as BluDesignFacilityRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Create a new facility
   */
  static async createFacility(
    projectId: string,
    userId: string,
    data: CreateFacilityRequest
  ): Promise<BluDesignFacility> {
    const settings: SceneSettings = {
      ...DEFAULT_SCENE_SETTINGS,
      ...(data.settings || {}),
    };

    const row = await super.create({
      project_id: projectId,
      name: data.name,
      description: data.description ?? null,
      version: '1.0.0',
      asset_manifest: JSON.stringify([]),
      objects: JSON.stringify([]),
      settings: JSON.stringify(settings),
      branding_config: data.brandingConfig ? JSON.stringify(data.brandingConfig) : null,
      linked_facility_id: data.linkedFacilityId ?? null,
      created_by: userId,
    }) as BluDesignFacilityRow;

    return this.toDomain(row);
  }

  /**
   * Update facility metadata
   */
  static async updateFacility(
    id: string,
    data: UpdateFacilityRequest
  ): Promise<BluDesignFacility | undefined> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.settings !== undefined) {
      const existing = await this.findById(id);
      if (existing) {
        updateData.settings = JSON.stringify({
          ...existing.settings,
          ...data.settings,
        });
      }
    }
    if (data.brandingConfig !== undefined) {
      updateData.branding_config = JSON.stringify(data.brandingConfig);
    }
    if (data.linkedFacilityId !== undefined) {
      updateData.linked_facility_id = data.linkedFacilityId;
    }

    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }

    const row = await super.updateById(id, updateData) as BluDesignFacilityRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Update facility objects (placed items)
   */
  static async updateObjects(
    id: string,
    objects: PlacedObject[]
  ): Promise<BluDesignFacility | undefined> {
    // Extract unique asset IDs from objects
    const assetIds = [...new Set(objects.map(o => o.assetId))];

    const row = await super.updateById(id, {
      objects: JSON.stringify(objects),
      asset_manifest: JSON.stringify(assetIds),
    }) as BluDesignFacilityRow | undefined;

    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Add a single object to facility
   */
  static async addObject(
    id: string,
    object: PlacedObject
  ): Promise<BluDesignFacility | undefined> {
    const facility = await this.findById(id);
    if (!facility) return undefined;

    const objects = [...facility.objects, object];
    return this.updateObjects(id, objects);
  }

  /**
   * Update a single object in facility
   */
  static async updateObject(
    facilityId: string,
    objectId: string,
    updates: Partial<PlacedObject>
  ): Promise<BluDesignFacility | undefined> {
    const facility = await this.findById(facilityId);
    if (!facility) return undefined;

    const objects = facility.objects.map(obj =>
      obj.id === objectId ? { ...obj, ...updates, updatedAt: new Date() } : obj
    );

    return this.updateObjects(facilityId, objects);
  }

  /**
   * Remove an object from facility
   */
  static async removeObject(
    facilityId: string,
    objectId: string
  ): Promise<BluDesignFacility | undefined> {
    const facility = await this.findById(facilityId);
    if (!facility) return undefined;

    const objects = facility.objects.filter(obj => obj.id !== objectId);
    return this.updateObjects(facilityId, objects);
  }

  /**
   * Increment version
   */
  static async incrementVersion(id: string): Promise<BluDesignFacility | undefined> {
    const facility = await this.findById(id);
    if (!facility) return undefined;

    const parts = facility.version.split('.');
    const patch = parseInt(parts[2] || '0', 10) + 1;
    const newVersion = `${parts[0]}.${parts[1]}.${patch}`;

    const row = await super.updateById(id, { version: newVersion }) as BluDesignFacilityRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Delete a facility
   */
  static async deleteFacility(id: string): Promise<boolean> {
    const affected = await super.deleteById(id);
    return affected > 0;
  }

  /**
   * Count facilities in a project
   */
  static async countByProject(projectId: string): Promise<number> {
    return this.count({ project_id: projectId });
  }

  /**
   * Check if facility belongs to project
   */
  static async belongsToProject(facilityId: string, projectId: string): Promise<boolean> {
    const row = await this.query()
      .where('id', facilityId)
      .where('project_id', projectId)
      .first();
    return !!row;
  }
}

