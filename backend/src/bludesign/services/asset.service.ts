/**
 * BluDesign Asset Service
 * 
 * Handles asset definitions, material presets, and custom model management.
 */

import { DatabaseService } from '@/services/database.service';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { createStorageProvider, getDefaultStorageProvider, storageConfigForProject } from './storage';
import { BluDesignProjectModel } from '../models/bludesign-project.model';

// Types
export interface AssetCategory {
  id: string;
  name: string;
}

export interface AssetDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface GridUnits {
  x: number;
  z: number;
}

export interface PrimitiveSpec {
  type: 'box' | 'cylinder' | 'plane' | 'custom';
  params?: Record<string, unknown>;
}

export interface MaterialConfig {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export interface BindingContract {
  entityType: string;
  requiredFields: string[];
  stateField?: string;
  stateValues?: string[];
}

/**
 * Locker specification for procedurally generated storage units
 */
export interface LockerSpec {
  /** Which side the door is on */
  doorSide: 'front' | 'back' | 'left' | 'right';
  /** Width of the door in meters */
  doorWidth: number;
  /** Height of the door in meters */
  doorHeight: number;
  /** Horizontal offset from center in meters (0 = centered) */
  doorPositionX: number;
  /** Vertical offset from bottom in meters */
  doorPositionY: number;
}

export interface AssetDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  modelType: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  globalModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions: AssetDimensions;
  gridUnits: GridUnits;
  isSmart: boolean;
  canRotate: boolean;
  canStack: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  /** Locker-specific configuration for procedural storage units */
  lockerSpec?: LockerSpec;
  /** Position offset for custom models (meters from grid origin) */
  positionOffset?: { x: number; y: number; z: number };
  isBuiltin: boolean;
  thumbnail?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialPreset {
  id: string;
  assetId: string;
  presetName: string;
  partName: string;
  materialConfig: MaterialConfig;
  textureId?: string;
  stateBinding?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomModel {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  format: 'gltf' | 'glb' | 'fbx' | 'obj';
  modelMetadata?: Record<string, unknown>;
  thumbnail?: string;
  tags?: string[];
  uploadedBy?: string;
  uploadedAt: Date;
}

export interface CreateAssetDefinitionInput {
  name: string;
  description?: string;
  category: string;
  modelType: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  globalModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions: AssetDimensions;
  gridUnits: GridUnits;
  isSmart?: boolean;
  canRotate?: boolean;
  canStack?: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  /** Locker-specific configuration for procedural storage units */
  lockerSpec?: LockerSpec;
  /** Position offset for custom models (meters from grid origin) */
  positionOffset?: { x: number; y: number; z: number };
  thumbnail?: string;
  createdBy?: string;
}

export interface UpdateAssetDefinitionInput {
  name?: string;
  description?: string;
  modelType?: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  globalModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions?: AssetDimensions;
  gridUnits?: GridUnits;
  isSmart?: boolean;
  canRotate?: boolean;
  canStack?: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  /** Locker-specific configuration for procedural storage units */
  lockerSpec?: LockerSpec;
  /** Position offset for custom models (meters from grid origin) */
  positionOffset?: { x: number; y: number; z: number };
  thumbnail?: string;
}

export interface CreateMaterialPresetInput {
  assetId: string;
  presetName: string;
  partName: string;
  materialConfig: MaterialConfig;
  textureId?: string;
  stateBinding?: string;
  sortOrder?: number;
}

export interface CreateCustomModelInput {
  projectId: string;
  name: string;
  description?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  format: 'gltf' | 'glb' | 'fbx' | 'obj';
  modelMetadata?: Record<string, unknown>;
  thumbnail?: string;
  tags?: string[];
  uploadedBy?: string;
}

export interface GlobalModel {
  id: string;
  name: string;
  description?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  format: 'gltf' | 'glb' | 'fbx' | 'obj';
  modelMetadata?: Record<string, unknown>;
  thumbnail?: string;
  tags?: string[];
  uploadedBy?: string;
  uploadedAt: Date;
}

export interface CreateGlobalModelInput {
  id?: string; // Optional: use this ID instead of generating a new one
  name: string;
  description?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  format: 'gltf' | 'glb' | 'fbx' | 'obj';
  modelMetadata?: Record<string, unknown>;
  thumbnail?: string;
  tags?: string[];
  uploadedBy?: string;
}

export class AssetService {
  // ========================================================================
  // Asset Definitions
  // ========================================================================

  static async getAssetDefinitions(options?: {
    category?: string;
    isSmart?: boolean;
    isBuiltin?: boolean;
  }): Promise<AssetDefinition[]> {
    try {
      const db = DatabaseService.getInstance().connection;
      let query = db('bludesign_asset_definitions').select('*');

      if (options?.category) {
        query = query.where('category', options.category);
      }
      if (options?.isSmart !== undefined) {
        query = query.where('is_smart', options.isSmart);
      }
      if (options?.isBuiltin !== undefined) {
        query = query.where('is_builtin', options.isBuiltin);
      }

      const rows = await query.orderBy('name');

      return rows.map(this.mapAssetDefinitionRow);
    } catch (error) {
      logger.error('Failed to get asset definitions:', error);
      throw error;
    }
  }

  static async getAssetDefinition(id: string): Promise<AssetDefinition | null> {
    try {
      const db = DatabaseService.getInstance().connection;
      const row = await db('bludesign_asset_definitions').where('id', id).first();

      if (!row) return null;
      return this.mapAssetDefinitionRow(row);
    } catch (error) {
      logger.error('Failed to get asset definition:', error);
      throw error;
    }
  }

  static async createAssetDefinition(input: CreateAssetDefinitionInput): Promise<AssetDefinition> {
    try {
      const db = DatabaseService.getInstance().connection;
      const id = uuidv4();
      const now = new Date();

      await db('bludesign_asset_definitions').insert({
        id,
        name: input.name,
        description: input.description,
        category: input.category,
        model_type: input.modelType,
        custom_model_id: input.customModelId,
        global_model_id: input.globalModelId,
        primitive_spec: JSON.stringify(input.primitiveSpec),
        dimensions: JSON.stringify(input.dimensions),
        grid_units: JSON.stringify(input.gridUnits),
        is_smart: input.isSmart ?? false,
        can_rotate: input.canRotate ?? true,
        can_stack: input.canStack ?? false,
        binding_contract: input.bindingContract ? JSON.stringify(input.bindingContract) : null,
        default_materials: input.defaultMaterials ? JSON.stringify(input.defaultMaterials) : null,
        locker_spec: input.lockerSpec ? JSON.stringify(input.lockerSpec) : null,
        position_offset: input.positionOffset ? JSON.stringify(input.positionOffset) : null,
        is_builtin: false,
        thumbnail: input.thumbnail,
        created_by: input.createdBy,
        created_at: now,
        updated_at: now,
      });

      return (await this.getAssetDefinition(id))!;
    } catch (error) {
      logger.error('Failed to create asset definition:', error);
      throw error;
    }
  }

  static async updateAssetDefinition(id: string, input: UpdateAssetDefinitionInput): Promise<AssetDefinition | null> {
    try {
      const db = DatabaseService.getInstance().connection;
      const updates: Record<string, unknown> = { updated_at: new Date() };

      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.modelType !== undefined) updates.model_type = input.modelType;
      if (input.customModelId !== undefined) updates.custom_model_id = input.customModelId;
      if (input.globalModelId !== undefined) updates.global_model_id = input.globalModelId;
      if (input.primitiveSpec !== undefined) updates.primitive_spec = JSON.stringify(input.primitiveSpec);
      if (input.dimensions !== undefined) updates.dimensions = JSON.stringify(input.dimensions);
      if (input.gridUnits !== undefined) updates.grid_units = JSON.stringify(input.gridUnits);
      if (input.isSmart !== undefined) updates.is_smart = input.isSmart;
      if (input.canRotate !== undefined) updates.can_rotate = input.canRotate;
      if (input.canStack !== undefined) updates.can_stack = input.canStack;
      if (input.bindingContract !== undefined) updates.binding_contract = JSON.stringify(input.bindingContract);
      if (input.defaultMaterials !== undefined) updates.default_materials = JSON.stringify(input.defaultMaterials);
      if (input.lockerSpec !== undefined) updates.locker_spec = JSON.stringify(input.lockerSpec);
      if (input.positionOffset !== undefined) updates.position_offset = JSON.stringify(input.positionOffset);
      if (input.thumbnail !== undefined) updates.thumbnail = input.thumbnail;

      await db('bludesign_asset_definitions').where('id', id).update(updates);

      return this.getAssetDefinition(id);
    } catch (error) {
      logger.error('Failed to update asset definition:', error);
      throw error;
    }
  }

  static async deleteAssetDefinition(id: string): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().connection;
      
      // Get the asset definition first to check for associated models
      const asset = await db('bludesign_asset_definitions').where('id', id).first();
      if (!asset) return false;
      if (asset.is_builtin) {
        throw new Error('Cannot delete built-in assets');
      }

      // Delete associated custom model if present and not used by other asset definitions
      if (asset.custom_model_id) {
        try {
          // Check if this custom model is used by other asset definitions
          const otherAssetsUsingModel = await db('bludesign_asset_definitions')
            .where('custom_model_id', asset.custom_model_id)
            .where('id', '!=', id)
            .count('* as count')
            .first();
          
          const isUsedElsewhere = otherAssetsUsingModel && Number(otherAssetsUsingModel.count) > 0;
          
          if (!isUsedElsewhere) {
            const customModel = await this.getCustomModel(asset.custom_model_id);
            if (customModel) {
              // Get the project for the custom model
              const project = await BluDesignProjectModel.findById(customModel.projectId);
              if (project) {
                const provider = createStorageProvider(storageConfigForProject(project));
                // Extract the model ID from the storage path to delete the asset files
                const pathParts = customModel.storagePath.split('/');
                const modelAssetId = pathParts.length > 2 ? pathParts[pathParts.length - 2] : customModel.id;
                try {
                  await provider.deleteAssetFiles(customModel.projectId, modelAssetId);
                } catch (storageError) {
                  logger.warn('Failed to delete custom model storage files:', storageError);
                  // Continue with DB deletion even if file deletion fails
                }
              }
              // Delete the custom model database record
              await this.deleteCustomModel(asset.custom_model_id);
            }
          } else {
            logger.info(`Custom model ${asset.custom_model_id} is used by other asset definitions, skipping deletion`);
          }
        } catch (modelError) {
          logger.warn('Failed to delete custom model:', modelError);
          // Continue with asset definition deletion even if model deletion fails
        }
      }

      // Delete associated global model if present and not used by other asset definitions
      if (asset.global_model_id) {
        try {
          // Check if this global model is used by other asset definitions
          const otherAssetsUsingModel = await db('bludesign_asset_definitions')
            .where('global_model_id', asset.global_model_id)
            .where('id', '!=', id)
            .count('* as count')
            .first();
          
          const isUsedElsewhere = otherAssetsUsingModel && Number(otherAssetsUsingModel.count) > 0;
          
          if (!isUsedElsewhere) {
            const globalModel = await this.getGlobalModel(asset.global_model_id);
            if (globalModel) {
              const provider = getDefaultStorageProvider();
              try {
                await provider.deleteGlobalAsset(asset.global_model_id);
              } catch (storageError) {
                logger.warn('Failed to delete global model storage files:', storageError);
                // Continue with DB deletion even if file deletion fails
              }
              // Delete the global model database record
              await this.deleteGlobalModel(asset.global_model_id);
            }
          } else {
            logger.info(`Global model ${asset.global_model_id} is used by other asset definitions, skipping deletion`);
          }
        } catch (modelError) {
          logger.warn('Failed to delete global model:', modelError);
          // Continue with asset definition deletion even if model deletion fails
        }
      }

      // Finally, delete the asset definition
      await db('bludesign_asset_definitions').where('id', id).delete();
      return true;
    } catch (error) {
      logger.error('Failed to delete asset definition:', error);
      throw error;
    }
  }

  // ========================================================================
  // Material Presets
  // ========================================================================

  static async getMaterialPresets(assetId: string): Promise<MaterialPreset[]> {
    try {
      const db = DatabaseService.getInstance().connection;
      const rows = await db('bludesign_material_presets')
        .where('asset_id', assetId)
        .orderBy('sort_order');

      return rows.map(this.mapMaterialPresetRow);
    } catch (error) {
      logger.error('Failed to get material presets:', error);
      throw error;
    }
  }

  static async createMaterialPreset(input: CreateMaterialPresetInput): Promise<MaterialPreset> {
    try {
      const db = DatabaseService.getInstance().connection;
      const id = uuidv4();
      const now = new Date();

      await db('bludesign_material_presets').insert({
        id,
        asset_id: input.assetId,
        preset_name: input.presetName,
        part_name: input.partName,
        material_config: JSON.stringify(input.materialConfig),
        texture_id: input.textureId,
        state_binding: input.stateBinding,
        sort_order: input.sortOrder ?? 0,
        created_at: now,
        updated_at: now,
      });

      const row = await db('bludesign_material_presets').where('id', id).first();
      return this.mapMaterialPresetRow(row);
    } catch (error) {
      logger.error('Failed to create material preset:', error);
      throw error;
    }
  }

  static async updateMaterialPreset(id: string, updates: Partial<CreateMaterialPresetInput>): Promise<MaterialPreset | null> {
    try {
      const db = DatabaseService.getInstance().connection;
      const updateData: Record<string, unknown> = { updated_at: new Date() };

      if (updates.presetName !== undefined) updateData.preset_name = updates.presetName;
      if (updates.partName !== undefined) updateData.part_name = updates.partName;
      if (updates.materialConfig !== undefined) updateData.material_config = JSON.stringify(updates.materialConfig);
      if (updates.textureId !== undefined) updateData.texture_id = updates.textureId;
      if (updates.stateBinding !== undefined) updateData.state_binding = updates.stateBinding;
      if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

      await db('bludesign_material_presets').where('id', id).update(updateData);

      const row = await db('bludesign_material_presets').where('id', id).first();
      if (!row) return null;
      return this.mapMaterialPresetRow(row);
    } catch (error) {
      logger.error('Failed to update material preset:', error);
      throw error;
    }
  }

  static async deleteMaterialPreset(id: string): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().connection;
      const deleted = await db('bludesign_material_presets').where('id', id).delete();
      return deleted > 0;
    } catch (error) {
      logger.error('Failed to delete material preset:', error);
      throw error;
    }
  }

  // ========================================================================
  // Custom Models
  // ========================================================================

  static async getCustomModels(projectId: string): Promise<CustomModel[]> {
    try {
      const db = DatabaseService.getInstance().connection;
      const rows = await db('bludesign_custom_models')
        .where('project_id', projectId)
        .orderBy('name');

      return rows.map(this.mapCustomModelRow);
    } catch (error) {
      logger.error('Failed to get custom models:', error);
      throw error;
    }
  }

  static async getCustomModel(id: string): Promise<CustomModel | null> {
    try {
      const db = DatabaseService.getInstance().connection;
      const row = await db('bludesign_custom_models').where('id', id).first();

      if (!row) return null;
      return this.mapCustomModelRow(row);
    } catch (error) {
      logger.error('Failed to get custom model:', error);
      throw error;
    }
  }

  static async createCustomModel(input: CreateCustomModelInput): Promise<CustomModel> {
    try {
      const db = DatabaseService.getInstance().connection;
      const id = uuidv4();

      await db('bludesign_custom_models').insert({
        id,
        project_id: input.projectId,
        name: input.name,
        description: input.description,
        filename: input.filename,
        content_type: input.contentType,
        file_size: input.fileSize,
        storage_path: input.storagePath,
        format: input.format,
        model_metadata: input.modelMetadata ? JSON.stringify(input.modelMetadata) : null,
        thumbnail: input.thumbnail,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        uploaded_by: input.uploadedBy,
        uploaded_at: new Date(),
      });

      return (await this.getCustomModel(id))!;
    } catch (error) {
      logger.error('Failed to create custom model:', error);
      throw error;
    }
  }

  static async deleteCustomModel(id: string): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().connection;
      const deleted = await db('bludesign_custom_models').where('id', id).delete();
      return deleted > 0;
    } catch (error) {
      logger.error('Failed to delete custom model:', error);
      throw error;
    }
  }

  // ========================================================================
  // Global Models
  // ========================================================================

  static async getGlobalModels(): Promise<GlobalModel[]> {
    try {
      const db = DatabaseService.getInstance().connection;
      const rows = await db('bludesign_global_models')
        .orderBy('name');

      return rows.map(this.mapGlobalModelRow);
    } catch (error) {
      logger.error('Failed to get global models:', error);
      throw error;
    }
  }

  static async getGlobalModel(id: string): Promise<GlobalModel | null> {
    try {
      const db = DatabaseService.getInstance().connection;
      const row = await db('bludesign_global_models').where('id', id).first();

      if (!row) return null;
      return this.mapGlobalModelRow(row);
    } catch (error) {
      logger.error('Failed to get global model:', error);
      throw error;
    }
  }

  static async createGlobalModel(input: CreateGlobalModelInput): Promise<GlobalModel> {
    try {
      const db = DatabaseService.getInstance().connection;
      const id = input.id || uuidv4(); // Use provided ID or generate new one

      await db('bludesign_global_models').insert({
        id,
        name: input.name,
        description: input.description,
        filename: input.filename,
        content_type: input.contentType,
        file_size: input.fileSize,
        storage_path: input.storagePath,
        format: input.format,
        model_metadata: input.modelMetadata ? JSON.stringify(input.modelMetadata) : null,
        thumbnail: input.thumbnail,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        uploaded_by: input.uploadedBy,
        uploaded_at: new Date(),
      });

      return (await this.getGlobalModel(id))!;
    } catch (error) {
      logger.error('Failed to create global model:', error);
      throw error;
    }
  }

  static async deleteGlobalModel(id: string): Promise<boolean> {
    try {
      const db = DatabaseService.getInstance().connection;
      const deleted = await db('bludesign_global_models').where('id', id).delete();
      return deleted > 0;
    } catch (error) {
      logger.error('Failed to delete global model:', error);
      throw error;
    }
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapAssetDefinitionRow(row: any): AssetDefinition {
    // Helper to safely parse JSON that might already be an object
    const safeParseJSON = (value: any) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') return value;
      return JSON.parse(value);
    };

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      modelType: row.model_type,
      customModelId: row.custom_model_id,
      globalModelId: row.global_model_id,
      primitiveSpec: safeParseJSON(row.primitive_spec),
      dimensions: safeParseJSON(row.dimensions),
      gridUnits: safeParseJSON(row.grid_units),
      isSmart: Boolean(row.is_smart), // Ensure boolean conversion
      canRotate: Boolean(row.can_rotate),
      canStack: Boolean(row.can_stack),
      bindingContract: safeParseJSON(row.binding_contract),
      defaultMaterials: safeParseJSON(row.default_materials),
      lockerSpec: safeParseJSON(row.locker_spec),
      positionOffset: safeParseJSON(row.position_offset),
      isBuiltin: row.is_builtin,
      thumbnail: row.thumbnail,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapMaterialPresetRow(row: any): MaterialPreset {
    // Helper to safely parse JSON that might already be an object
    const safeParseJSON = (value: any) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') return value;
      return JSON.parse(value);
    };

    return {
      id: row.id,
      assetId: row.asset_id,
      presetName: row.preset_name,
      partName: row.part_name,
      materialConfig: safeParseJSON(row.material_config),
      textureId: row.texture_id,
      stateBinding: row.state_binding,
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapCustomModelRow(row: any): CustomModel {
    // Helper to safely parse JSON that might already be an object
    const safeParseJSON = (value: any) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') return value;
      return JSON.parse(value);
    };

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      filename: row.filename,
      contentType: row.content_type,
      fileSize: row.file_size,
      storagePath: row.storage_path,
      format: row.format,
      modelMetadata: safeParseJSON(row.model_metadata),
      thumbnail: row.thumbnail,
      tags: safeParseJSON(row.tags),
      uploadedBy: row.uploaded_by,
      uploadedAt: new Date(row.uploaded_at),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapGlobalModelRow(row: any): GlobalModel {
    // Helper to safely parse JSON that might already be an object
    const safeParseJSON = (value: any) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') return value;
      return JSON.parse(value);
    };

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      filename: row.filename,
      contentType: row.content_type,
      fileSize: row.file_size,
      storagePath: row.storage_path,
      format: row.format,
      modelMetadata: safeParseJSON(row.model_metadata),
      thumbnail: row.thumbnail,
      tags: safeParseJSON(row.tags),
      uploadedBy: row.uploaded_by,
      uploadedAt: new Date(row.uploaded_at),
    };
  }
}



