/**
 * Loading Manager
 * 
 * Central orchestrator for loading BluDesign assets and facilities.
 * Provides progress tracking and error handling.
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export interface LoadingProgress {
  phase: 'initializing' | 'downloading' | 'parsing' | 'creating' | 'complete' | 'error';
  percentage: number;
  message?: string;
  error?: string;
  /** Optional: current item being loaded */
  currentItem?: string;
  /** Optional: number of items completed */
  current?: number;
  /** Optional: total number of items */
  total?: number;
}

export interface LoadResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type ProgressCallback = (progress: LoadingProgress) => void;

export class LoadingManager {
  private threeLoadingManager: THREE.LoadingManager;
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private textureLoader: THREE.TextureLoader;
  private dracoLoader: DRACOLoader;
  
  // Cache for loaded assets
  private gltfCache: Map<string, GLTF> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  
  // Progress tracking
  private progressCallback: ProgressCallback | null = null;
  private loadingItems: Map<string, { loaded: number; total: number }> = new Map();
  private currentPhase: LoadingProgress['phase'] = 'initializing';
  private currentItem: string | undefined;
  private totalItems: number = 0;
  private completedItems: number = 0;

  constructor() {
    // Create Three.js loading manager
    this.threeLoadingManager = new THREE.LoadingManager(
      () => this.onLoadComplete(),
      (url, loaded, total) => this.onProgress(url, loaded, total),
      (url) => this.onError(url)
    );
    
    // Initialize DRACO decoder for compressed models
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.dracoLoader.setDecoderConfig({ type: 'js' });
    
    // Initialize loaders
    this.gltfLoader = new GLTFLoader(this.threeLoadingManager);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    
    this.fbxLoader = new FBXLoader(this.threeLoadingManager);
    this.textureLoader = new THREE.TextureLoader(this.threeLoadingManager);
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Load a GLTF/GLB model
   */
  async loadGLTF(url: string, useCache: boolean = true): Promise<LoadResult<GLTF>> {
    // Check cache first
    if (useCache && this.gltfCache.has(url)) {
      return { success: true, data: this.gltfCache.get(url)! };
    }

    this.startLoading(url, 'downloading');
    
    return new Promise((resolve) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          if (useCache) {
            this.gltfCache.set(url, gltf);
          }
          this.itemComplete(url);
          resolve({ success: true, data: gltf });
        },
        (progress) => {
          this.updateItemProgress(url, progress.loaded, progress.total);
        },
        (error) => {
          this.itemError(url, error.message);
          resolve({ success: false, error: error.message });
        }
      );
    });
  }

  /**
   * Load an FBX model
   */
  async loadFBX(url: string): Promise<LoadResult<THREE.Group>> {
    this.startLoading(url, 'downloading');
    
    return new Promise((resolve) => {
      this.fbxLoader.load(
        url,
        (group) => {
          this.itemComplete(url);
          resolve({ success: true, data: group });
        },
        (progress) => {
          this.updateItemProgress(url, progress.loaded, progress.total);
        },
        (error) => {
          this.itemError(url, error.message);
          resolve({ success: false, error: error.message });
        }
      );
    });
  }

  /**
   * Load a texture
   */
  async loadTexture(url: string, useCache: boolean = true): Promise<LoadResult<THREE.Texture>> {
    // Check cache first
    if (useCache && this.textureCache.has(url)) {
      return { success: true, data: this.textureCache.get(url)! };
    }

    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          if (useCache) {
            this.textureCache.set(url, texture);
          }
          resolve({ success: true, data: texture });
        },
        undefined,
        (error) => {
          resolve({ success: false, error: error.message });
        }
      );
    });
  }

  /**
   * Load multiple items with progress tracking
   */
  async loadBatch<T>(
    items: Array<{ id: string; load: () => Promise<LoadResult<T>> }>,
    label?: string
  ): Promise<Map<string, LoadResult<T>>> {
    const results = new Map<string, LoadResult<T>>();
    
    this.totalItems = items.length;
    this.completedItems = 0;
    this.currentPhase = 'downloading';
    this.emitProgress(label || 'Loading items...');
    
    for (const item of items) {
      this.currentItem = item.id;
      this.emitProgress(`Loading ${item.id}...`);
      
      const result = await item.load();
      results.set(item.id, result);
      
      this.completedItems++;
      this.emitProgress(result.success ? `Loaded ${item.id}` : `Failed: ${item.id}`);
    }
    
    this.currentPhase = 'complete';
    this.emitProgress('All items loaded');
    
    return results;
  }

  /**
   * Preload assets for a facility
   */
  async preloadFacilityAssets(
    assetUrls: Array<{ id: string; url: string; type: 'gltf' | 'fbx' | 'texture' }>
  ): Promise<{
    loaded: number;
    failed: number;
    errors: string[];
  }> {
    const results = {
      loaded: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    this.totalItems = assetUrls.length;
    this.completedItems = 0;
    this.currentPhase = 'downloading';
    
    for (const asset of assetUrls) {
      this.currentItem = asset.id;
      this.emitProgress(`Preloading ${asset.id}...`);
      
      let result: LoadResult<unknown>;
      
      switch (asset.type) {
        case 'gltf':
          result = await this.loadGLTF(asset.url);
          break;
        case 'fbx':
          result = await this.loadFBX(asset.url);
          break;
        case 'texture':
          result = await this.loadTexture(asset.url);
          break;
      }
      
      if (result.success) {
        results.loaded++;
      } else {
        results.failed++;
        results.errors.push(`${asset.id}: ${result.error}`);
      }
      
      this.completedItems++;
    }
    
    this.currentPhase = 'complete';
    this.emitProgress(`Preloaded ${results.loaded}/${assetUrls.length} assets`);
    
    return results;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    // Dispose textures
    this.textureCache.forEach((texture) => {
      texture.dispose();
    });
    this.textureCache.clear();
    
    // Clear GLTF cache (geometries and materials should be disposed by caller)
    this.gltfCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { gltfCount: number; textureCount: number } {
    return {
      gltfCount: this.gltfCache.size,
      textureCount: this.textureCache.size,
    };
  }

  // ==========================================================================
  // Progress Tracking
  // ==========================================================================

  private startLoading(url: string, phase: LoadingProgress['phase']): void {
    this.currentPhase = phase;
    this.currentItem = url;
    this.loadingItems.set(url, { loaded: 0, total: 0 });
    this.emitProgress(`Loading ${this.getFilename(url)}...`);
  }

  private updateItemProgress(url: string, loaded: number, total: number): void {
    this.loadingItems.set(url, { loaded, total });
    this.emitProgress();
  }

  private itemComplete(url: string): void {
    this.loadingItems.delete(url);
    this.completedItems++;
    this.emitProgress(`Loaded ${this.getFilename(url)}`);
  }

  private itemError(url: string, error: string): void {
    this.loadingItems.delete(url);
    this.currentPhase = 'error';
    this.emitProgress(`Failed to load ${this.getFilename(url)}: ${error}`);
  }

  private onLoadComplete(): void {
    this.currentPhase = 'complete';
    this.emitProgress('Loading complete');
  }

  private onProgress(url: string, loaded: number, total: number): void {
    this.updateItemProgress(url, loaded, total);
  }

  private onError(url: string): void {
    this.itemError(url, 'Unknown error');
  }

  private emitProgress(message?: string): void {
    if (!this.progressCallback) return;
    
    // Calculate total progress from all loading items
    let totalLoaded = 0;
    let totalSize = 0;
    
    this.loadingItems.forEach(({ loaded, total }) => {
      totalLoaded += loaded;
      totalSize += total || loaded; // Use loaded as estimate if total unknown
    });
    
    const itemProgress = totalSize > 0 ? totalLoaded / totalSize : 0;
    const overallProgress = this.totalItems > 0
      ? (this.completedItems + itemProgress) / this.totalItems
      : itemProgress;
    
    this.progressCallback({
      phase: this.currentPhase,
      current: this.completedItems,
      total: this.totalItems,
      percentage: Math.round(overallProgress * 100),
      currentItem: this.currentItem,
      message,
    });
  }

  private getFilename(url: string): string {
    return url.split('/').pop() || url;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearCache();
    this.dracoLoader.dispose();
  }
}

// Singleton instance
let loadingManagerInstance: LoadingManager | null = null;

export function getLoadingManager(): LoadingManager {
  if (!loadingManagerInstance) {
    loadingManagerInstance = new LoadingManager();
  }
  return loadingManagerInstance;
}

export function disposeLoadingManager(): void {
  if (loadingManagerInstance) {
    loadingManagerInstance.dispose();
    loadingManagerInstance = null;
  }
}

