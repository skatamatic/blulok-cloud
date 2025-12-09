/**
 * BluDesign Project Model
 * 
 * Model for multi-tenant project containers.
 */

import { BaseModel } from '@/models/base.model';
import {
  BluDesignProject,
  StorageProviderType,
  BrandingConfig,
  CreateProjectRequest,
} from '../types/bludesign.types';

export interface BluDesignProjectRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  storage_provider: StorageProviderType;
  storage_config: string | null; // JSON string
  default_branding: string | null; // JSON string
  created_at: Date;
  updated_at: Date;
}

export class BluDesignProjectModel extends BaseModel {
  protected static get tableName(): string {
    return 'bludesign_projects';
  }

  /**
   * Convert database row to domain object
   */
  private static toDomain(row: BluDesignProjectRow): BluDesignProject {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      ownerId: row.owner_id,
      storageProvider: row.storage_provider,
      storageConfig: row.storage_config ? JSON.parse(row.storage_config) : undefined,
      defaultBranding: row.default_branding ? JSON.parse(row.default_branding) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Find project by ID
   */
  static async findById(id: string): Promise<BluDesignProject | undefined> {
    const row = await this.query().where('id', id).first() as BluDesignProjectRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Find all projects owned by a user
   */
  static async findByOwner(ownerId: string): Promise<BluDesignProject[]> {
    const rows = await this.query()
      .where('owner_id', ownerId)
      .orderBy('created_at', 'desc') as BluDesignProjectRow[];
    return rows.map(this.toDomain);
  }

  /**
   * Create a new project
   */
  static async createProject(
    ownerId: string,
    data: CreateProjectRequest
  ): Promise<BluDesignProject> {
    const row = await super.create({
      name: data.name,
      description: data.description ?? null,
      owner_id: ownerId,
      storage_provider: data.storageProvider ?? StorageProviderType.LOCAL,
      storage_config: data.storageConfig ? JSON.stringify(data.storageConfig) : null,
      default_branding: data.defaultBranding ? JSON.stringify(data.defaultBranding) : null,
    }) as BluDesignProjectRow;

    return this.toDomain(row);
  }

  /**
   * Update project
   */
  static async updateProject(
    id: string,
    data: Partial<CreateProjectRequest>
  ): Promise<BluDesignProject | undefined> {
    const updateData: Record<string, unknown> = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.storageProvider !== undefined) updateData.storage_provider = data.storageProvider;
    if (data.storageConfig !== undefined) updateData.storage_config = JSON.stringify(data.storageConfig);
    if (data.defaultBranding !== undefined) updateData.default_branding = JSON.stringify(data.defaultBranding);
    
    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }
    
    const row = await super.updateById(id, updateData) as BluDesignProjectRow | undefined;
    return row ? this.toDomain(row) : undefined;
  }

  /**
   * Delete project and all associated data
   */
  static async deleteProject(id: string): Promise<boolean> {
    const affected = await super.deleteById(id);
    return affected > 0;
  }

  /**
   * Check if user owns project
   */
  static async isOwner(projectId: string, userId: string): Promise<boolean> {
    const row = await this.query()
      .where('id', projectId)
      .where('owner_id', userId)
      .first();
    return !!row;
  }

  /**
   * Get project count for user
   */
  static async countByOwner(ownerId: string): Promise<number> {
    return this.count({ owner_id: ownerId });
  }
}

