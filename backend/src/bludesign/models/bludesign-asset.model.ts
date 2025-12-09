/**
 * BluDesign Asset Model
 * 
 * Model for asset metadata storage.
 */

import { BaseModel } from '@/models/base.model';
import {
  BluDesignAsset,
  AssetCategory,
  GeometryType,
  AssetGeometry,
  AssetMaterials,
  AssetMetadata,
  BindingContract,
  CreateAssetRequest,
  UpdateAssetRequest,
} from '../types/bludesign.types';

export interface BluDesignAssetRow {
  id: string;
  project_id: string;
  name: string;
  version: string;
  category: AssetCategory;
  geometry_type: GeometryType;
  geometry_source: string | null;
  primitive_spec: string | null; // JSON
  materials: string | null; // JSON
  is_smart: boolean;
  binding_contract: string | null; // JSON
  metadata: string; // JSON
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export class BluDesignAssetModel extends BaseModel {
  protected static get tableName(): string {
    return 'bludesign_assets';
  }

  /**
   * Convert database row to domain object
   */
  private static toDomain(row: BluDesignAssetRow): BluDesignAsset {
    const geometry: AssetGeometry = {
      type: row.geometry_type,
      source: row.geometry_source ?? undefined,
      primitiveSpec: row.primitive_spec ? JSON.parse(row.primitive_spec) : undefined,
    };

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      version: row.version,
      category: row.category,
      geometry,
      materials: row.materials ? JSON.parse(row.materials) : { slots: {} },
      isSmart: row.is_smart,
      binding: row.binding_contract ? JSON.parse(row.binding_contract) : undefined,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by ?? '',
    };
  }

  /**
   * Find asset by ID
   */
  static async findById(id: string): Promise<BluDesignAsset | undefined> {
    const row = await this.query().where('id', id).first() as BluDesignAssetRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Find all assets in a project
   */
  static async findByProject(
    projectId: string,
    options?: {
      category?: AssetCategory;
      isSmart?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<BluDesignAsset[]> {
    let query = this.query().where('project_id', projectId);

    if (options?.category) {
      query = query.where('category', options.category);
    }
    if (options?.isSmart !== undefined) {
      query = query.where('is_smart', options.isSmart);
    }
    if (options?.search) {
      query = query.where('name', 'like', `%${options.search}%`);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    query = query.orderBy('name', 'asc');

    const rows = await query as BluDesignAssetRow[];
    return rows.map(this.toDomain);
  }

  /**
   * Find assets by IDs (for loading facility assets)
   */
  static async findByIds(ids: string[]): Promise<BluDesignAsset[]> {
    if (ids.length === 0) return [];
    
    const rows = await this.query().whereIn('id', ids) as BluDesignAssetRow[];
    return rows.map(this.toDomain);
  }

  /**
   * Create a new asset
   */
  static async createAsset(
    projectId: string,
    userId: string,
    data: CreateAssetRequest
  ): Promise<BluDesignAsset> {
    const row = await super.create({
      project_id: projectId,
      name: data.name,
      version: '1.0.0',
      category: data.category,
      geometry_type: data.geometry.type,
      geometry_source: data.geometry.source ?? null,
      primitive_spec: data.geometry.primitiveSpec
        ? JSON.stringify(data.geometry.primitiveSpec)
        : null,
      materials: data.materials ? JSON.stringify(data.materials) : null,
      is_smart: data.isSmart ?? false,
      binding_contract: data.binding ? JSON.stringify(data.binding) : null,
      metadata: JSON.stringify(data.metadata),
      created_by: userId,
    }) as BluDesignAssetRow;

    return this.toDomain(row);
  }

  /**
   * Update an asset
   */
  static async updateAsset(
    id: string,
    data: UpdateAssetRequest
  ): Promise<BluDesignAsset | undefined> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.geometry !== undefined) {
      updateData.geometry_type = data.geometry.type;
      updateData.geometry_source = data.geometry.source ?? null;
      updateData.primitive_spec = data.geometry.primitiveSpec
        ? JSON.stringify(data.geometry.primitiveSpec)
        : null;
    }
    if (data.materials !== undefined) {
      updateData.materials = JSON.stringify(data.materials);
    }
    if (data.binding !== undefined) {
      updateData.binding_contract = JSON.stringify(data.binding);
      updateData.is_smart = true;
    }
    if (data.metadata !== undefined) {
      // Merge with existing metadata
      const existing = await this.findById(id);
      if (existing) {
        updateData.metadata = JSON.stringify({
          ...existing.metadata,
          ...data.metadata,
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }

    const row = await super.updateById(id, updateData) as BluDesignAssetRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Increment version
   */
  static async incrementVersion(id: string): Promise<BluDesignAsset | undefined> {
    const asset = await this.findById(id);
    if (!asset) return undefined;

    const parts = asset.version.split('.');
    const patch = parseInt(parts[2] || '0', 10) + 1;
    const newVersion = `${parts[0]}.${parts[1]}.${patch}`;

    const row = await super.updateById(id, { version: newVersion }) as BluDesignAssetRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Delete an asset
   */
  static async deleteAsset(id: string): Promise<boolean> {
    const affected = await super.deleteById(id);
    return affected > 0;
  }

  /**
   * Count assets in a project
   */
  static async countByProject(projectId: string): Promise<number> {
    return this.count({ project_id: projectId });
  }

  /**
   * Check if asset belongs to project
   */
  static async belongsToProject(assetId: string, projectId: string): Promise<boolean> {
    const row = await this.query()
      .where('id', assetId)
      .where('project_id', projectId)
      .first();
    return !!row;
  }
}

