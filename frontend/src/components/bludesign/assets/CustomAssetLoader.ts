/**
 * Custom Asset Loader
 * 
 * Singleton class for loading and caching custom 3D model meshes.
 * Pre-loads all global custom assets during editor initialization for instant access.
 * 
 * ARCHITECTURE:
 * - Caches RAW (unscaled) models by globalModelId for efficient reuse
 * - Applies scaling per-asset when cloning (each asset can have different dimensions)
 * - Deduplicates concurrent load requests
 * - Handles model loading errors gracefully
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { AssetDefinition } from '../services/AssetService';
import { getApiBaseUrl } from '../../../services/appConfig';

// Cached raw model data (unscaled, at natural size)
interface CachedRawModel {
  model: THREE.Object3D;
  naturalSize: THREE.Vector3;  // Original bounding box size
  naturalCenter: THREE.Vector3; // Original bounding box center
}

export class CustomAssetLoader {
  private static instance: CustomAssetLoader | null = null;
  
  // Cache raw (unscaled) models by globalModelId
  private rawModelCache: Map<string, CachedRawModel> = new Map();
  private loadingPromises: Map<string, Promise<CachedRawModel>> = new Map();
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;

  private constructor() {
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
    
    // Configure loaders to include auth token in requests
    this.updateAuthHeaders();
  }
  
  /**
   * Update authentication headers for loaders
   * Call this when the auth token changes
   */
  private updateAuthHeaders(): void {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    this.gltfLoader.setRequestHeader(headers);
    this.fbxLoader.setRequestHeader(headers);
  }

  static getInstance(): CustomAssetLoader {
    if (!CustomAssetLoader.instance) {
      CustomAssetLoader.instance = new CustomAssetLoader();
    }
    return CustomAssetLoader.instance;
  }

  /**
   * Pre-load all global custom assets
   * Called during editor initialization to cache all raw models
   */
  async preloadGlobalAssets(assetDefinitions: AssetDefinition[]): Promise<void> {
    const customAssets = assetDefinitions.filter(
      def => def.globalModelId && def.modelType !== 'primitive'
    );

    console.log(`Pre-loading ${customAssets.length} custom assets...`);

    // De-duplicate by globalModelId (multiple assets can share the same model)
    const uniqueModelIds = new Set<string>();
    const assetsToLoad: AssetDefinition[] = [];
    
    for (const asset of customAssets) {
      if (asset.globalModelId && !uniqueModelIds.has(asset.globalModelId)) {
        uniqueModelIds.add(asset.globalModelId);
        assetsToLoad.push(asset);
      }
    }

    const loadPromises = assetsToLoad.map(async (asset) => {
      try {
        await this.loadRawModel(asset.globalModelId!);
        console.log(`✓ Loaded raw model: ${asset.name}`);
      } catch (error) {
        console.error(`✗ Failed to load ${asset.name}:`, error);
      }
    });

    await Promise.allSettled(loadPromises);
    console.log(`Pre-loading complete. ${this.rawModelCache.size} raw models cached.`);
  }

  /**
   * Get a mesh for an asset definition
   * Returns a clone with scaling applied based on asset dimensions
   */
  async getMesh(assetDefinition: AssetDefinition): Promise<THREE.Object3D> {
    if (!assetDefinition.globalModelId) {
      throw new Error('No globalModelId in asset definition');
    }

    // Get or load raw model
    const rawModel = await this.loadRawModel(assetDefinition.globalModelId);
    
    // Clone and apply scaling for this specific asset
    return this.createScaledClone(rawModel, assetDefinition);
  }

  /**
   * Load a raw (unscaled) model from the backend
   */
  private async loadRawModel(globalModelId: string): Promise<CachedRawModel> {
    // Return from cache if available
    if (this.rawModelCache.has(globalModelId)) {
      return this.rawModelCache.get(globalModelId)!;
    }

    // If already loading, wait for that promise
    if (this.loadingPromises.has(globalModelId)) {
      return await this.loadingPromises.get(globalModelId)!;
    }

    // Start new load
    const loadPromise = this.fetchAndCacheRawModel(globalModelId);
    this.loadingPromises.set(globalModelId, loadPromise);

    try {
      const rawModel = await loadPromise;
      this.rawModelCache.set(globalModelId, rawModel);
      this.loadingPromises.delete(globalModelId);
      return rawModel;
    } catch (error) {
      this.loadingPromises.delete(globalModelId);
      throw error;
    }
  }

  /**
   * Fetch model from backend and cache raw (unscaled) version
   */
  private async fetchAndCacheRawModel(globalModelId: string): Promise<CachedRawModel> {
    // Update auth headers in case token changed
    this.updateAuthHeaders();
    
    const url = this.getModelUrl(globalModelId);
    
    // Determine format from URL or default to GLB
    const format = url.toLowerCase().includes('.fbx') ? 'fbx' : 'glb';

    let model: THREE.Object3D;

    try {
      if (format === 'glb' || format === 'gltf') {
        const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
          this.gltfLoader.load(url, resolve, undefined, reject);
        });
        model = gltf.scene;
      } else if (format === 'fbx') {
        model = await new Promise<THREE.Object3D>((resolve, reject) => {
          this.fbxLoader.load(url, resolve, undefined, reject);
        });
      } else {
        throw new Error(`Unsupported model format: ${format}`);
      }

      // Calculate natural bounding box BEFORE any transforms
      const box = new THREE.Box3().setFromObject(model);
      const naturalSize = box.getSize(new THREE.Vector3());
      const naturalCenter = box.getCenter(new THREE.Vector3());

      // Ensure all children have proper shadow settings
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Add userData for part identification
          if (!child.userData.partName) {
            child.userData.partName = child.name || 'body';
          }
        }
      });

      return {
        model,
        naturalSize,
        naturalCenter,
      };
    } catch (error) {
      console.error(`Failed to load model ${globalModelId}:`, error);
      throw error;
    }
  }

  /**
   * Create a scaled clone for a specific asset definition or metadata
   * Handles both AssetDefinition and AssetMetadata formats
   */
  private createScaledClone(rawModel: CachedRawModel, asset: AssetDefinition | any): THREE.Object3D {
    // Deep clone the model
    const clone = rawModel.model.clone(true);
    
    // Deep clone materials to avoid shared state
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });

    // Get dimensions - handle both AssetDefinition and AssetMetadata formats
    const dimensions = asset.dimensions;
    
    // Apply scaling based on asset dimensions
    if (dimensions) {
      const { naturalSize } = rawModel;
      
      const targetWidth = dimensions.width;
      const targetHeight = dimensions.height;
      const targetDepth = dimensions.depth;

      if (naturalSize.x > 0 && naturalSize.y > 0 && naturalSize.z > 0) {
        // Calculate scale factors
        const scaleX = targetWidth / naturalSize.x;
        const scaleY = targetHeight / naturalSize.y;
        const scaleZ = targetDepth / naturalSize.z;

        // Apply non-uniform scaling to match exact dimensions
        clone.scale.set(scaleX, scaleY, scaleZ);

        // Reset position for grounding calculation
        clone.position.set(0, 0, 0);

        // Recalculate bounding box after scaling
        const scaledBox = new THREE.Box3().setFromObject(clone);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        const scaledMin = scaledBox.min;

        // Position model so its center XZ is at origin, and bottom Y sits at ground (y=0)
        clone.position.x = -scaledCenter.x;
        clone.position.y = -scaledMin.y; // Places bottom of model at y=0
        clone.position.z = -scaledCenter.z;
      }
    }

    // Apply position offset if specified (after scaling)
    // Handle both direct positionOffset and nested in metadata
    const positionOffset = asset.positionOffset || asset.metadata?.positionOffset;
    if (positionOffset) {
      clone.position.add(new THREE.Vector3(
        positionOffset.x,
        positionOffset.y,
        positionOffset.z
      ));
    }

    return clone;
  }

  /**
   * Get the model URL for a globalModelId
   */
  private getModelUrl(globalModelId: string): string {
    const apiBaseUrl = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${apiBaseUrl}/api/v1/bludesign/assets/global-models/${globalModelId}/file`;
  }

  /**
   * Check if a raw model is cached
   */
  isCached(assetDefinition: AssetDefinition): boolean {
    const globalModelId = assetDefinition.globalModelId;
    return globalModelId ? this.rawModelCache.has(globalModelId) : false;
  }

  /**
   * Get a cached mesh synchronously (returns null if not cached)
   * Use this for synchronous contexts where you can't await
   */
  getCachedMesh(assetDefinition: AssetDefinition | any): THREE.Object3D | null {
    // Handle metadata format from AssetMetadata
    const globalModelId = assetDefinition.globalModelId || assetDefinition.metadata?.globalModelId;
    if (!globalModelId) return null;

    const rawModel = this.rawModelCache.get(globalModelId);
    if (!rawModel) return null;

    // Apply scaling for this asset
    return this.createScaledClone(rawModel, assetDefinition);
  }

  /**
   * Check if an asset is a custom model that needs special loading
   */
  static isCustomModel(asset: any): boolean {
    const globalModelId = asset.globalModelId || asset.metadata?.globalModelId;
    const modelType = asset.modelType || asset.metadata?.modelType;
    return !!(globalModelId && modelType !== 'primitive');
  }

  /**
   * Clear the cache (useful for testing or memory management)
   */
  clearCache(): void {
    // Dispose of all cached meshes
    this.rawModelCache.forEach(({ model }) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });

    this.rawModelCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Invalidate cache for a specific model (e.g., after updating asset dimensions)
   */
  invalidateModel(globalModelId: string): void {
    // We don't need to invalidate when dimensions change, since we apply scaling on clone
    // But this can be used if the actual model file changes
    const cached = this.rawModelCache.get(globalModelId);
    if (cached) {
      cached.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.rawModelCache.delete(globalModelId);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cached: number; loading: number } {
    return {
      cached: this.rawModelCache.size,
      loading: this.loadingPromises.size,
    };
  }
}
