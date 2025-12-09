/**
 * BluDesign Asset Service
 * 
 * Frontend service for fetching and caching asset definitions,
 * material presets, and custom models.
 */

import { apiService } from '../../../services/api.service';

// Types matching backend
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

export interface AssetDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  modelType: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions: AssetDimensions;
  gridUnits: GridUnits;
  isSmart: boolean;
  canRotate: boolean;
  canStack: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  isBuiltin: boolean;
  thumbnail?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
  uploadedAt: string;
}

export interface CreateAssetDefinitionInput {
  name: string;
  description?: string;
  category: string;
  modelType: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions: AssetDimensions;
  gridUnits: GridUnits;
  isSmart?: boolean;
  canRotate?: boolean;
  canStack?: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  thumbnail?: string;
}

export interface UpdateAssetDefinitionInput {
  name?: string;
  description?: string;
  modelType?: 'primitive' | 'gltf' | 'glb' | 'custom';
  customModelId?: string;
  primitiveSpec?: PrimitiveSpec;
  dimensions?: AssetDimensions;
  gridUnits?: GridUnits;
  canRotate?: boolean;
  canStack?: boolean;
  bindingContract?: BindingContract;
  defaultMaterials?: Record<string, MaterialConfig>;
  thumbnail?: string;
}

export interface CreateMaterialPresetInput {
  presetName: string;
  partName: string;
  materialConfig: MaterialConfig;
  textureId?: string;
  stateBinding?: string;
  sortOrder?: number;
}

// Cache for asset definitions
class AssetCache {
  private definitions: Map<string, AssetDefinition> = new Map();
  private allDefinitionsLoaded = false;
  private materialPresets: Map<string, MaterialPreset[]> = new Map();
  private customModels: Map<string, CustomModel[]> = new Map();
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  isStale(): boolean {
    return Date.now() - this.cacheTimestamp > this.CACHE_TTL;
  }

  setDefinitions(definitions: AssetDefinition[]): void {
    this.definitions.clear();
    definitions.forEach(def => this.definitions.set(def.id, def));
    this.allDefinitionsLoaded = true;
    this.cacheTimestamp = Date.now();
  }

  getDefinition(id: string): AssetDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): AssetDefinition[] {
    return Array.from(this.definitions.values());
  }

  hasAllDefinitions(): boolean {
    return this.allDefinitionsLoaded && !this.isStale();
  }

  setMaterialPresets(assetId: string, presets: MaterialPreset[]): void {
    this.materialPresets.set(assetId, presets);
  }

  getMaterialPresets(assetId: string): MaterialPreset[] | undefined {
    return this.materialPresets.get(assetId);
  }

  setCustomModels(projectId: string, models: CustomModel[]): void {
    this.customModels.set(projectId, models);
  }

  getCustomModels(projectId: string): CustomModel[] | undefined {
    return this.customModels.get(projectId);
  }

  invalidate(): void {
    this.definitions.clear();
    this.materialPresets.clear();
    this.customModels.clear();
    this.allDefinitionsLoaded = false;
    this.cacheTimestamp = 0;
  }

  invalidateDefinition(id: string): void {
    this.definitions.delete(id);
    this.materialPresets.delete(id);
  }

  invalidateProjectModels(projectId: string): void {
    this.customModels.delete(projectId);
  }
}

const cache = new AssetCache();

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export class AssetService {
  private static readonly BASE_URL = '/bludesign/assets';

  // ========================================================================
  // Asset Definitions
  // ========================================================================

  static async getAssetDefinitions(options?: {
    category?: string;
    isSmart?: boolean;
    isBuiltin?: boolean;
    forceRefresh?: boolean;
  }): Promise<AssetDefinition[]> {
    // Return cached if available and not forcing refresh
    if (!options?.forceRefresh && !options?.category && options?.isSmart === undefined && options?.isBuiltin === undefined) {
      if (cache.hasAllDefinitions()) {
        return cache.getAllDefinitions();
      }
    }

    const params: Record<string, string> = {};
    if (options?.category) params.category = options.category;
    if (options?.isSmart !== undefined) params.isSmart = String(options.isSmart);
    if (options?.isBuiltin !== undefined) params.isBuiltin = String(options.isBuiltin);

    try {
      const response = await apiService.get(`${this.BASE_URL}/definitions`, { params });
      
      if (response?.success && response.data) {
        // Only cache if fetching all
        if (!options?.category && options?.isSmart === undefined && options?.isBuiltin === undefined) {
          cache.setDefinitions(response.data);
        }
        return response.data;
      }
      
      // Handle direct array response
      if (Array.isArray(response)) {
        if (!options?.category && options?.isSmart === undefined && options?.isBuiltin === undefined) {
          cache.setDefinitions(response);
        }
        return response;
      }
      
      throw new Error(response?.message || 'Failed to fetch asset definitions');
    } catch (error: any) {
      console.error('Failed to fetch asset definitions:', error);
      // Return empty array on error - fallback to built-in assets
      return [];
    }
  }

  static async getAssetDefinition(id: string, forceRefresh = false): Promise<AssetDefinition | null> {
    // Check cache first
    if (!forceRefresh) {
      const cached = cache.getDefinition(id);
      if (cached) return cached;
    }

    try {
      const response = await apiService.get(`${this.BASE_URL}/definitions/${id}`);
      
      if (response?.success && response.data) {
        return response.data;
      }
      
      // Handle direct object response
      if (response && response.id) {
        return response;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  static async createAssetDefinition(input: CreateAssetDefinitionInput): Promise<AssetDefinition> {
    const response = await apiService.post(`${this.BASE_URL}/definitions`, input);
    
    if (response?.success && response.data) {
      cache.invalidate();
      return response.data;
    }
    
    if (response && response.id) {
      cache.invalidate();
      return response;
    }
    
    throw new Error(response?.message || 'Failed to create asset definition');
  }

  static async updateAssetDefinition(id: string, input: UpdateAssetDefinitionInput): Promise<AssetDefinition> {
    const response = await apiService.put(`${this.BASE_URL}/definitions/${id}`, input);
    
    if (response?.success && response.data) {
      cache.invalidateDefinition(id);
      return response.data;
    }
    
    if (response && response.id) {
      cache.invalidateDefinition(id);
      return response;
    }
    
    throw new Error(response?.message || 'Failed to update asset definition');
  }

  static async deleteAssetDefinition(id: string): Promise<void> {
    const response = await apiService.delete(`${this.BASE_URL}/definitions/${id}`);
    
    if (response?.success === false) {
      throw new Error(response?.message || 'Failed to delete asset definition');
    }
    
    cache.invalidateDefinition(id);
  }

  // ========================================================================
  // Material Presets
  // ========================================================================

  static async getMaterialPresets(assetId: string, forceRefresh = false): Promise<MaterialPreset[]> {
    // Check cache first
    if (!forceRefresh) {
      const cached = cache.getMaterialPresets(assetId);
      if (cached) return cached;
    }

    try {
      const response = await apiService.get(`${this.BASE_URL}/definitions/${assetId}/materials`);
      
      if (response?.success && response.data) {
        cache.setMaterialPresets(assetId, response.data);
        return response.data;
      }
      
      if (Array.isArray(response)) {
        cache.setMaterialPresets(assetId, response);
        return response;
      }
      
      return [];
    } catch {
      return [];
    }
  }

  static async createMaterialPreset(assetId: string, input: CreateMaterialPresetInput): Promise<MaterialPreset> {
    const response = await apiService.post(`${this.BASE_URL}/definitions/${assetId}/materials`, input);
    
    if (response?.success && response.data) {
      cache.invalidateDefinition(assetId);
      return response.data;
    }
    
    if (response && response.id) {
      cache.invalidateDefinition(assetId);
      return response;
    }
    
    throw new Error(response?.message || 'Failed to create material preset');
  }

  static async updateMaterialPreset(
    assetId: string, 
    presetId: string, 
    input: Partial<CreateMaterialPresetInput>
  ): Promise<MaterialPreset> {
    const response = await apiService.put(
      `${this.BASE_URL}/definitions/${assetId}/materials/${presetId}`,
      input
    );
    
    if (response?.success && response.data) {
      cache.invalidateDefinition(assetId);
      return response.data;
    }
    
    if (response && response.id) {
      cache.invalidateDefinition(assetId);
      return response;
    }
    
    throw new Error(response?.message || 'Failed to update material preset');
  }

  static async deleteMaterialPreset(assetId: string, presetId: string): Promise<void> {
    const response = await apiService.delete(
      `${this.BASE_URL}/definitions/${assetId}/materials/${presetId}`
    );
    
    if (response?.success === false) {
      throw new Error(response?.message || 'Failed to delete material preset');
    }
    
    cache.invalidateDefinition(assetId);
  }

  // ========================================================================
  // Custom Models
  // ========================================================================

  static async getCustomModels(projectId: string, forceRefresh = false): Promise<CustomModel[]> {
    // Check cache first
    if (!forceRefresh) {
      const cached = cache.getCustomModels(projectId);
      if (cached) return cached;
    }

    try {
      const response = await apiService.get(`${this.BASE_URL}/models/${projectId}`);
      
      if (response?.success && response.data) {
        cache.setCustomModels(projectId, response.data);
        return response.data;
      }
      
      if (Array.isArray(response)) {
        cache.setCustomModels(projectId, response);
        return response;
      }
      
      return [];
    } catch {
      return [];
    }
  }

  static async uploadCustomModel(
    projectId: string,
    file: File,
    name: string,
    description?: string,
    tags?: string[]
  ): Promise<CustomModel> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    if (description) formData.append('description', description);
    if (tags) formData.append('tags', JSON.stringify(tags));

    const response = await apiService.post(
      `${this.BASE_URL}/models/${projectId}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (response?.success && response.data) {
      cache.invalidateProjectModels(projectId);
      return response.data;
    }
    
    if (response && response.id) {
      cache.invalidateProjectModels(projectId);
      return response;
    }

    throw new Error(response?.message || 'Failed to upload custom model');
  }

  static async deleteCustomModel(projectId: string, modelId: string): Promise<void> {
    const response = await apiService.delete(
      `${this.BASE_URL}/models/${projectId}/${modelId}`
    );

    if (response?.success === false) {
      throw new Error(response?.message || 'Failed to delete custom model');
    }

    cache.invalidateProjectModels(projectId);
  }

  // ========================================================================
  // Cache Management
  // ========================================================================

  static clearCache(): void {
    cache.invalidate();
  }

  static getCachedDefinitions(): AssetDefinition[] {
    return cache.getAllDefinitions();
  }
}



