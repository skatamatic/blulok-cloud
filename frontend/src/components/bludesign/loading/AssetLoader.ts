/**
 * Asset Loader
 * 
 * Higher-level asset loading for BluDesign assets with
 * material processing and texture application.
 */

import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getLoadingManager, LoadResult, ProgressCallback } from './LoadingManager';
import {
  BluDesignAsset,
  GeometryType,
  AssetMaterials,
  BrandingOverride,
  MaterialSlot,
  PrimitiveSpec,
  PrimitiveType,
} from '../core/types';
import { AssetFactory } from '../assets/AssetFactory';

export interface LoadedAsset {
  asset: BluDesignAsset;
  object: THREE.Object3D;
  materials: Map<string, THREE.Material>;
}

export interface AssetLoadOptions {
  applyBranding?: BrandingOverride[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export class AssetLoader {
  private loadingManager = getLoadingManager();
  private loadedAssets: Map<string, LoadedAsset> = new Map();

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.loadingManager.setProgressCallback(callback);
  }

  /**
   * Load a single asset
   */
  async loadAsset(
    asset: BluDesignAsset,
    baseUrl: string,
    options: AssetLoadOptions = {}
  ): Promise<LoadResult<LoadedAsset>> {
    // Check if already loaded
    if (this.loadedAssets.has(asset.id)) {
      return { success: true, data: this.loadedAssets.get(asset.id)! };
    }

    try {
      let object: THREE.Object3D;

      switch (asset.geometry.type) {
        case GeometryType.PRIMITIVE:
          object = this.createPrimitiveObject(asset);
          break;

        case GeometryType.GLB:
        case GeometryType.GLTF: {
          const url = this.resolveUrl(asset.geometry.source!, baseUrl);
          const result = await this.loadingManager.loadGLTF(url);
          if (!result.success || !result.data) {
            return { success: false, error: result.error || 'Failed to load GLTF' };
          }
          object = result.data.scene.clone();
          break;
        }

        case GeometryType.FBX: {
          const url = this.resolveUrl(asset.geometry.source!, baseUrl);
          const result = await this.loadingManager.loadFBX(url);
          if (!result.success || !result.data) {
            return { success: false, error: result.error || 'Failed to load FBX' };
          }
          object = result.data.clone();
          break;
        }

        default:
          return { success: false, error: `Unknown geometry type: ${asset.geometry.type}` };
      }

      // Apply materials
      const materials = await this.applyMaterials(
        object,
        asset.materials,
        baseUrl,
        options.applyBranding
      );

      // Apply shadows
      this.applyShadows(object, options.castShadow ?? true, options.receiveShadow ?? true);

      // Store metadata
      object.userData.assetId = asset.id;
      object.userData.assetCategory = asset.category;
      object.userData.isSmart = asset.isSmart;
      object.userData.selectable = true;

      const loadedAsset: LoadedAsset = {
        asset,
        object,
        materials,
      };

      this.loadedAssets.set(asset.id, loadedAsset);

      return { success: true, data: loadedAsset };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Load multiple assets
   */
  async loadAssets(
    assets: BluDesignAsset[],
    baseUrl: string,
    options: AssetLoadOptions = {}
  ): Promise<{
    loaded: LoadedAsset[];
    failed: Array<{ assetId: string; error: string }>;
  }> {
    const loaded: LoadedAsset[] = [];
    const failed: Array<{ assetId: string; error: string }> = [];

    for (const asset of assets) {
      const result = await this.loadAsset(asset, baseUrl, options);
      if (result.success && result.data) {
        loaded.push(result.data);
      } else {
        failed.push({ assetId: asset.id, error: result.error || 'Unknown error' });
      }
    }

    return { loaded, failed };
  }

  /**
   * Get a loaded asset
   */
  getLoadedAsset(assetId: string): LoadedAsset | undefined {
    return this.loadedAssets.get(assetId);
  }

  /**
   * Clone a loaded asset for placement
   */
  cloneAsset(assetId: string): THREE.Object3D | null {
    const loaded = this.loadedAssets.get(assetId);
    if (!loaded) return null;

    const clone = loaded.object.clone(true);
    
    // Deep clone materials to allow independent modification
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => m.clone());
        } else if (child.material) {
          child.material = child.material.clone();
        }
      }
    });

    return clone;
  }

  /**
   * Create primitive geometry object
   */
  private createPrimitiveObject(asset: BluDesignAsset): THREE.Object3D {
    // Convert BluDesignAsset to format expected by AssetFactory
    // AssetFactory expects AssetMetadata with id, name, category, etc.
    const assetMetadata = {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      description: asset.metadata.description,
      thumbnail: asset.metadata.thumbnail,
      dimensions: asset.metadata.dimensions,
      isSmart: asset.isSmart,
      canRotate: asset.metadata.canRotate,
      canStack: asset.metadata.canStack,
      gridUnits: asset.metadata.gridUnits,
    };
    return AssetFactory.createAssetMesh(assetMetadata as any);
  }

  /**
   * Apply materials to an object
   */
  private async applyMaterials(
    object: THREE.Object3D,
    materials: AssetMaterials,
    baseUrl: string,
    brandingOverrides?: BrandingOverride[]
  ): Promise<Map<string, THREE.Material>> {
    const appliedMaterials = new Map<string, THREE.Material>();

    // Create materials from slots
    for (const [slotName, slot] of Object.entries(materials.slots)) {
      const material = await this.createMaterialFromSlot(slot, baseUrl);
      appliedMaterials.set(slotName, material);
    }

    // Apply branding overrides
    if (brandingOverrides) {
      for (const override of brandingOverrides) {
        const material = appliedMaterials.get(override.slotName);
        if (material && material instanceof THREE.MeshStandardMaterial) {
          if (override.color) {
            material.color.set(override.color);
          }
          if (override.textureUrl) {
            const result = await this.loadingManager.loadTexture(
              this.resolveUrl(override.textureUrl, baseUrl)
            );
            if (result.success && result.data) {
              material.map = result.data;
              material.needsUpdate = true;
            }
          }
        }
      }
    }

    // Apply materials to meshes by name matching
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name) {
        const material = appliedMaterials.get(child.name);
        if (material) {
          child.material = material;
        }
      }
    });

    return appliedMaterials;
  }

  /**
   * Create a Three.js material from a slot definition
   */
  private async createMaterialFromSlot(
    slot: MaterialSlot,
    baseUrl: string
  ): Promise<THREE.MeshStandardMaterial> {
    const material = new THREE.MeshStandardMaterial({
      color: slot.defaultColor,
      metalness: slot.metalness ?? 0.3,
      roughness: slot.roughness ?? 0.7,
    });

    if (slot.emissive) {
      material.emissive.set(slot.emissive);
      material.emissiveIntensity = slot.emissiveIntensity ?? 0;
    }

    if (slot.defaultTexture) {
      const result = await this.loadingManager.loadTexture(
        this.resolveUrl(slot.defaultTexture, baseUrl)
      );
      if (result.success && result.data) {
        material.map = result.data;
      }
    }

    return material;
  }

  /**
   * Apply shadow settings to an object
   */
  private applyShadows(
    object: THREE.Object3D,
    castShadow: boolean,
    receiveShadow: boolean
  ): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
  }

  /**
   * Resolve a relative URL to absolute
   */
  private resolveUrl(path: string, baseUrl: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
      return path;
    }
    return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  /**
   * Unload an asset and free resources
   */
  unloadAsset(assetId: string): void {
    const loaded = this.loadedAssets.get(assetId);
    if (!loaded) return;

    // Dispose geometries and materials
    loaded.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    loaded.materials.forEach((material) => material.dispose());

    this.loadedAssets.delete(assetId);
  }

  /**
   * Unload all assets
   */
  unloadAll(): void {
    this.loadedAssets.forEach((_, assetId) => {
      this.unloadAsset(assetId);
    });
  }

  /**
   * Get loading statistics
   */
  getStats(): { loadedCount: number; cacheStats: { gltfCount: number; textureCount: number } } {
    return {
      loadedCount: this.loadedAssets.size,
      cacheStats: this.loadingManager.getCacheStats(),
    };
  }
}

// Singleton instance
let assetLoaderInstance: AssetLoader | null = null;

export function getAssetLoader(): AssetLoader {
  if (!assetLoaderInstance) {
    assetLoaderInstance = new AssetLoader();
  }
  return assetLoaderInstance;
}

export function disposeAssetLoader(): void {
  if (assetLoaderInstance) {
    assetLoaderInstance.unloadAll();
    assetLoaderInstance = null;
  }
}

